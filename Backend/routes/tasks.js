const express = require("express");
const router = express.Router();
const pool = require("../db");
const validateTask = require("../middleware/validateTask");
const authenticateToken = require("../middleware/authenticateToken");

// Calculate the next due date
function getNextDueDate(dueDate, interval) {
  const dateString =
    dueDate instanceof Date
      ? dueDate.toISOString().slice(0, 10)
      : String(dueDate).slice(0, 10);

  const [year, month, day] = dateString.split("-").map(Number);

  const date = new Date(Date.UTC(year, month - 1, day));

  if (interval === "daily") {
    date.setUTCDate(date.getUTCDate() + 1);
  } else if (interval === "weekly") {
    date.setUTCDate(date.getUTCDate() + 7);
  } else if (interval === "monthly") {
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + 1);

    const lastDay = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();

    date.setUTCDate(Math.min(day, lastDay));
  }

  return date.toISOString().slice(0, 10);
}

// Generate the next recurring task
function generateNextOccurrence(task, callback) {
  if (
    !task.is_recurring ||
    !task.recurrence_interval ||
    task.next_occurrence_generated
  ) {
    return callback(null, null);
  }

  if (!task.due_date) {
    return callback(new Error("Recurring task needs a due date."));
  }

  const nextDueDate = getNextDueDate(task.due_date, task.recurrence_interval);

  const originalTaskId = task.recurring_task_id || task.id;

  pool.getConnection((connectionError, connection) => {
    if (connectionError) {
      return callback(connectionError);
    }

    connection.beginTransaction((transactionError) => {
      if (transactionError) {
        connection.release();
        return callback(transactionError);
      }

      // Prevent generating the same occurrence twice
      const updateSql = `
                UPDATE tasks
                SET next_occurrence_generated = TRUE
                WHERE id = ?
                AND user_id = ?
                AND next_occurrence_generated = FALSE
            `;

      connection.query(
        updateSql,
        [task.id, task.user_id],
        (updateError, updateResult) => {
          if (updateError) {
            return connection.rollback(() => {
              connection.release();
              callback(updateError);
            });
          }

          // Another request may have generated it already
          if (updateResult.affectedRows === 0) {
            return connection.commit((commitError) => {
              connection.release();
              callback(commitError, null);
            });
          }

          const insertSql = `
                        INSERT INTO tasks (
                            title,
                            description,
                            category,
                            priority,
                            status,
                            due_date,
                            user_id,
                            is_recurring,
                            recurrence_interval,
                            recurring_task_id,
                            occurrence_date,
                            next_occurrence_generated
                        )
                        VALUES (?, ?, ?, ?, 'pending', ?, ?, TRUE, ?, ?, ?, FALSE)
                    `;

          connection.query(
            insertSql,
            [
              task.title,
              task.description,
              task.category,
              task.priority,
              nextDueDate,
              task.user_id,
              task.recurrence_interval,
              originalTaskId,
              nextDueDate,
            ],
            (insertError, result) => {
              if (insertError) {
                return connection.rollback(() => {
                  connection.release();
                  callback(insertError);
                });
              }

              connection.commit((commitError) => {
                if (commitError) {
                  return connection.rollback(() => {
                    connection.release();
                    callback(commitError);
                  });
                }

                connection.release();
                callback(null, result.insertId);
              });
            },
          );
        },
      );
    });
  });
}

// Validate recurring task settings
function validateRecurrence(body) {
  if (body.is_recurring === true || body.is_recurring === 1) {
    const allowedIntervals = ["daily", "weekly", "monthly"];

    if (!allowedIntervals.includes(body.recurrence_interval)) {
      return "Choose a valid recurrence interval.";
    }

    if (!body.due_date) {
      return "Recurring tasks must have a due date.";
    }
  }

  if (
    body.is_recurring !== undefined &&
    typeof body.is_recurring !== "boolean" &&
    body.is_recurring !== 0 &&
    body.is_recurring !== 1
  ) {
    return "is_recurring must be true or false.";
  }

  return null;
}

// GET TASK STATISTICS
router.get("/stats", authenticateToken, (req, res, next) => {
  const sql = `
        SELECT
            COUNT(*) AS totalTasks,

            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)
                AS pendingTasks,

            SUM(CASE WHEN status = 'in-progress' THEN 1 ELSE 0 END)
                AS inProgressTasks,

            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)
                AS completedTasks,

            SUM(
                CASE
                    WHEN due_date < CURDATE()
                    AND status != 'completed'
                    THEN 1
                    ELSE 0
                END
            ) AS overdueTasks

        FROM tasks
        WHERE user_id = ?
    `;

  pool.query(sql, [req.user.id], (err, results) => {
    if (err) {
      return next(err);
    }

    const stats = results[0];

    const totalTasks = Number(stats.totalTasks);
    const completedTasks = Number(stats.completedTasks);

    const completionPercentage =
      totalTasks === 0
        ? 0
        : Number(((completedTasks / totalTasks) * 100).toFixed(2));

    res.status(200).json({
      totalTasks,
      pendingTasks: Number(stats.pendingTasks),
      inProgressTasks: Number(stats.inProgressTasks),
      completedTasks,
      overdueTasks: Number(stats.overdueTasks),
      completionPercentage,
    });
  });
});

// GET ONE TASK
router.get("/:id", authenticateToken, (req, res, next) => {
  const id = req.params.id;

  if (!/^\d+$/.test(id) || Number(id) < 1) {
    return res.status(400).json({
      message: "Invalid task ID.",
    });
  }

  const sql = `
        SELECT *
        FROM tasks
        WHERE id = ? AND user_id = ?
    `;

  pool.query(sql, [id, req.user.id], (err, results) => {
    if (err) {
      return next(err);
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "Task not found.",
      });
    }

    res.status(200).json(results[0]);
  });
});

// GET ALL TASKS WITH FILTERING, SEARCH AND PAGINATION
router.get("/", authenticateToken, (req, res, next) => {
  const {
    status,
    priority,
    category,
    search,
    sort,
    page = "1",
    limit = "10",
  } = req.query;

  const currentPage = Number(page);
  const pageSize = Number(limit);

  if (
    !Number.isInteger(currentPage) ||
    !Number.isInteger(pageSize) ||
    currentPage < 1 ||
    pageSize < 1 ||
    pageSize > 100
  ) {
    return res.status(400).json({
      message: "Invalid page or limit.",
    });
  }

  const validStatuses = ["pending", "in-progress", "completed"];
  const validPriorities = ["low", "medium", "high"];

  const validCategories = [
    "University",
    "Learning",
    "Daily Life",
    "Goals",
    "Personal",
  ];

  const validSortOptions = ["deadline", "deadline_desc"];

  if (status !== undefined && !validStatuses.includes(status)) {
    return res.status(400).json({
      message: "Invalid status.",
    });
  }

  if (priority !== undefined && !validPriorities.includes(priority)) {
    return res.status(400).json({
      message: "Invalid priority.",
    });
  }

  if (category !== undefined && !validCategories.includes(category)) {
    return res.status(400).json({
      message: "Invalid category.",
    });
  }

  if (
    search !== undefined &&
    (typeof search !== "string" || search.trim() === "" || search.length > 100)
  ) {
    return res.status(400).json({
      message: "Search must contain 1-100 characters.",
    });
  }

  if (sort !== undefined && !validSortOptions.includes(sort)) {
    return res.status(400).json({
      message: "Invalid sort option.",
    });
  }

  let sql = "SELECT * FROM tasks WHERE user_id = ?";
  const values = [req.user.id];

  if (status !== undefined) {
    sql += " AND status = ?";
    values.push(status);
  }

  if (priority !== undefined) {
    sql += " AND priority = ?";
    values.push(priority);
  }

  if (category !== undefined) {
    sql += " AND category = ?";
    values.push(category);
  }

  if (search !== undefined) {
    sql += " AND title LIKE ?";
    values.push(`%${search.trim()}%`);
  }

  if (sort === "deadline") {
    sql += " ORDER BY due_date IS NULL, due_date ASC";
  } else if (sort === "deadline_desc") {
    sql += " ORDER BY due_date IS NULL, due_date DESC";
  } else {
    sql += " ORDER BY created_at DESC";
  }

  const offset = (currentPage - 1) * pageSize;

  sql += " LIMIT ? OFFSET ?";
  values.push(pageSize, offset);

  pool.query(sql, values, (err, results) => {
    if (err) {
      return next(err);
    }

    res.status(200).json(results);
  });
});

// CREATE TASK
router.post("/", authenticateToken, (req, res, next) => {
  const error = validateTask(req.body);

  if (error) {
    return res.status(400).json({
      message: error,
    });
  }

  const recurrenceError = validateRecurrence(req.body);

  if (recurrenceError) {
    return res.status(400).json({
      message: recurrenceError,
    });
  }

  const {
    title,
    description,
    category,
    priority,
    status,
    due_date,
    is_recurring = false,
    recurrence_interval = null,
  } = req.body;

  const sql = `
        INSERT INTO tasks (
            title,
            description,
            category,
            priority,
            status,
            due_date,
            user_id,
            is_recurring,
            recurrence_interval
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

  pool.query(
    sql,
    [
      title.trim(),
      description || null,
      category,
      priority,
      status,
      due_date || null,
      req.user.id,
      is_recurring,
      is_recurring ? recurrence_interval : null,
    ],
    (err, result) => {
      if (err) {
        return next(err);
      }

      res.status(201).json({
        message: "Task created successfully.",
        id: result.insertId,
      });
    },
  );
});

// UPDATE TASK
router.put("/:id", authenticateToken, (req, res, next) => {
  const id = req.params.id;

  if (!/^\d+$/.test(id) || Number(id) < 1) {
    return res.status(400).json({
      message: "Invalid task ID.",
    });
  }

  const error = validateTask(req.body);

  if (error) {
    return res.status(400).json({
      message: error,
    });
  }

  const recurrenceError = validateRecurrence(req.body);

  if (recurrenceError) {
    return res.status(400).json({
      message: recurrenceError,
    });
  }

  // Check whether the task belongs to this user
  const findSql = `
        SELECT *
        FROM tasks
        WHERE id = ? AND user_id = ?
    `;

  pool.query(findSql, [id, req.user.id], (findError, results) => {
    if (findError) {
      return next(findError);
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "Task not found.",
      });
    }

    const {
      title,
      description,
      category,
      priority,
      status,
      due_date,
      is_recurring = false,
      recurrence_interval = null,
    } = req.body;

    const updateSql = `
            UPDATE tasks
            SET title = ?,
                description = ?,
                category = ?,
                priority = ?,
                status = ?,
                due_date = ?,
                is_recurring = ?,
                recurrence_interval = ?,
                next_occurrence_generated = FALSE
            WHERE id = ? AND user_id = ?
        `;

    pool.query(
      updateSql,
      [
        title.trim(),
        description || null,
        category,
        priority,
        status,
        due_date || null,
        is_recurring,
        is_recurring ? recurrence_interval : null,
        id,
        req.user.id,
      ],
      (updateError) => {
        if (updateError) {
          return next(updateError);
        }

        // Generate the next task when a recurring task is completed
        if (status === "completed") {
          const updatedTaskSql = `
                        SELECT *
                        FROM tasks
                        WHERE id = ? AND user_id = ?
                    `;

          pool.query(
            updatedTaskSql,
            [id, req.user.id],
            (taskError, taskResults) => {
              if (taskError) {
                return next(taskError);
              }

              generateNextOccurrence(
                taskResults[0],
                (generationError, newTaskId) => {
                  if (generationError) {
                    return next(generationError);
                  }

                  res.status(200).json({
                    message: "Task updated successfully.",
                    nextOccurrenceId: newTaskId,
                  });
                },
              );
            },
          );
        } else {
          res.status(200).json({
            message: "Task updated successfully.",
          });
        }
      },
    );
  });
});

// DELETE TASK
router.delete("/:id", authenticateToken, (req, res, next) => {
  const id = req.params.id;

  if (!/^\d+$/.test(id) || Number(id) < 1) {
    return res.status(400).json({
      message: "Invalid task ID.",
    });
  }

  const sql = `
        DELETE FROM tasks
        WHERE id = ? AND user_id = ?
    `;

  pool.query(sql, [id, req.user.id], (err, result) => {
    if (err) {
      return next(err);
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Task not found.",
      });
    }

    res.status(200).json({
      message: "Task deleted successfully.",
    });
  });
});

module.exports = router;
