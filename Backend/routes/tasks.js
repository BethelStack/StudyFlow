const pool = require("../db");
const express = require("express");
const router = express.Router();
const validateTask = require('../middleware/validateTask');
const authenticateToken = require("../middleware/authenticateToken");





const recurringColumns = [
  {
    name: "is_recurring",
    definition: "BOOLEAN NOT NULL DEFAULT FALSE",
  },
  {
    name: "recurrence_interval",
    definition: "ENUM('daily', 'weekly', 'monthly') NULL",
  },
  {
    name: "recurring_task_id",
    definition: "INT NULL",
  },
  {
    name: "occurrence_date",
    definition: "DATE NULL",
  },
  {
    name: "next_occurrence_generated",
    definition: "BOOLEAN NOT NULL DEFAULT FALSE",
  },
];

function addRecurringColumns(index = 0) {
  if (index >= recurringColumns.length) {
    console.log("Recurring task columns are ready.");
    return;
  }

  const column = recurringColumns[index];

  const checkSql = `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tasks'
      AND COLUMN_NAME = ?
  `;

  pool.query(checkSql, [column.name], (err, results) => {
    if (err) {
      console.error("Could not check columns:", err.message);
      return;
    }

    if (results.length > 0) {
      console.log(`${column.name} already exists.`);
      return addRecurringColumns(index + 1);
    }

    const alterSql = `
      ALTER TABLE tasks
      ADD COLUMN ${column.name} ${column.definition}
    `;

    pool.query(alterSql, (alterError) => {
      if (alterError) {
        console.error(`Could not add ${column.name}:`, alterError.message);
        return;
      }

      console.log(`${column.name} added successfully.`);
      addRecurringColumns(index + 1);
    });
  });
}

addRecurringColumns();










// router.get('/',(req,res)=>{
//     pool.query("SELECT * FROM TASKS",(err,results)=>{
//         if(err){
//             return res.status(500).json({error:err.message});
//         }
//         res.status(200).json(results);
//     })

// })
// router.get("/:id",(req,res,next)=>{
//     const id = req.params.id;
//     const sql = "SELECT * FROM tasks WHERE id=?";
//     pool.query(sql,[id],(err,results)=>{
//         if(err){
//             return next(err);
//         }
//        if(results.length === 0){
//         const error = new Error("Task not found");
//         error.status = 404;
//         return next(err);
//        }
//        res.json(results[0]);
//     })
// })





// Calculate the next due date
function getNextDueDate(dueDate, interval) {
    const date = new Date(dueDate);

    if (interval === "daily") {
        date.setUTCDate(date.getUTCDate() + 1);
    } 
    else if (interval === "weekly") {
        date.setUTCDate(date.getUTCDate() + 7);
    } 
    else if (interval === "monthly") {
        const day = date.getUTCDate();

        date.setUTCDate(1);
        date.setUTCMonth(date.getUTCMonth() + 1);

        const lastDay = new Date(
            Date.UTC(
                date.getUTCFullYear(),
                date.getUTCMonth() + 1,
                0
            )
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
            recurrence_interval,
            recurring_task_id,
            occurrence_date,
            next_occurrence_generated
        )
        VALUES (?, ?, ?, ?, 'pending', ?, ?, TRUE, ?, ?, ?, FALSE)
    `;

  pool.query(
    sql,
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
    (err, result) => {
      if (err) {
        return callback(err);
      }

      pool.query(
        `UPDATE tasks
                 SET next_occurrence_generated = TRUE
                 WHERE id = ?`,
        [task.id],
        (updateError) => {
          if (updateError) {
            return callback(updateError);
          }

          callback(null, result.insertId);
        },
      );
    },
  );
}








router.get("/stats",(req,res,next)=>{
    const sql = `
    SELECT COUNT(*) AS totalTasks,
    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pendingTasks,
    SUM(CASE WHEN status = 'in-progress' THEN 1 ELSE 0 END) AS inprogressTasks,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completedTasks,
    SUM(CASE WHEN due_date < CURDATE() AND status != 'completed' THEN 1 ELSE 0 END)  AS overdueTasks FROM tasks
    `;
    pool.query(sql,(err,results)=>{
        if(err){
            return next(err);
        }
        const stats = results[0];
        const totalTasks = stats.totalTasks;
        const completedTasks = stats.completedTasks;

        const completionPercentage =
          totalTasks === 0
            ? 0
            : Number(((completedTasks / totalTasks) * 100).toFixed(2));
            res.status(200).json({
              totalTasks,
              pendingTasks: stats.pendingTasks,
              inProgressTasks: stats.inProgressTasks,
              completedTasks,
              overdueTasks: stats.overdueTasks,
              completionPercentage,
            });
    })
})



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

  const offset = (currentPage - 1) * pageSize;

  // Allowed values
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

  // 1. Validate status
  if (status !== undefined) {
    if (typeof status !== "string" || !validStatuses.includes(status)) {
      return res.status(400).json({
        message: "Invalid status",
      });
    }
  }

  // 2. Validate priority
  if (priority !== undefined) {
    if (typeof priority !== "string" || !validPriorities.includes(priority)) {
      return res.status(400).json({
        message: "Invalid priority",
      });
    }
  }

  // 3. Validate category
  if (category !== undefined) {
    if (typeof category !== "string" || !validCategories.includes(category)) {
      return res.status(400).json({
        message: "Invalid category",
      });
    }
  }

  // 4. Validate search
  if (search !== undefined) {
    if (
      typeof search !== "string" ||
      search.trim() === "" ||
      search.length > 100
    ) {
      return res.status(400).json({
        message: "Search must contain 1-100 characters",
      });
    }
  }

  // 5. Validate sorting
  if (sort !== undefined) {
    if (typeof sort !== "string" || !validSortOptions.includes(sort)) {
      return res.status(400).json({
        message: "Invalid sort option. Use deadline or deadline_desc",
      });
    }
  }

  // 6. Build SQL query
  let sql = "SELECT * FROM tasks WHERE 1=1";
  const values = [];

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

  // 7. Sort by deadline
  if (sort === "deadline") {
    sql += " ORDER BY due_date IS NULL, due_date ASC";
  } else if (sort === "deadline_desc") {
    sql += " ORDER BY due_date IS NULL, due_date DESC";
  }

  sql += " LIMIT ? OFFSET ?";
  values.push(pageSize, offset);

  // 8. Execute query
  pool.query(sql, values, (err, results) => {
    if (err) {
      return next(err);
    }

    return res.status(200).json(results);
  });
});







router.post('/',(req,res)=>{
    const { title,description,category,priority,status,due_date } = req.body;
    
     const sql = `INSERT INTO tasks(title,description,category,priority,status,due_date)
    VALUES(?,?,?,?,?,?);
    `;
     pool.query(
       sql,
       [title, description, category, priority, status, due_date],
       (err, result) => {
         if (err) {
           return res.status(500).json({ error: err.message });
         }
         res.status(201).json({ message: "task created", id: result.insertId });
       },
     );
     const error = validateTask(req.body);

     if (error) {
       return res.status(400).json({ message: error });
     }

     });
    

// router.put("/:id", (req, res) => {

//   const id = req.params.id;

//   const { title, description, category, priority, status, due_date } = req.body;

//   const sql = `UPDATE tasks
//         SET title = ?, description = ?, category = ?, priority = ?, status = ?, due_date = ?
//         WHERE id = ?`;

//   pool.query(
//     sql,
//     [title, description, category, priority, status, due_date, id],
//     (err, result) => {
//       if (err) {
//         return res.status(500).json({ error: err.message });
//       }

//       if (result.affectedRows === 0) {
//         return res.status(404).json({ message: "Task not found" });
//       }

//       res.status(200).json({ message: "Task updated successfully" });
//     },
//   );
//   const error = validateTask(req.body);

//   if (error) {
//     return res.status(400).json({ message: error });
//   }
// });




router.put("/:id", authenticateToken, (req, res) => {
  const id = req.params.id;

  const error = validateTask(req.body);

  if (error) {
    return res.status(400).json({ message: error });
  }

  const { title, description, category, priority, status, due_date } = req.body;

  const sql = `
    UPDATE tasks
    SET title = ?, description = ?, category = ?,
        priority = ?, status = ?, due_date = ?
    WHERE id = ?
  `;

  pool.query(
    sql,
    [title, description, category, priority, status, due_date, id],
    (err, result) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Task not found" });
      }

      // ADD THE RECURRING-TASK LOGIC HERE
      if (status === "completed") {
        const findSql = "SELECT * FROM tasks WHERE id = ?";

        pool.query(findSql, [id], (findError, results) => {
          if (findError) {
            return res.status(500).json({
              message: "Could not retrieve the task.",
            });
          }

          const task = results[0];

          generateNextOccurrence(task, (generationError, newTaskId) => {
            if (generationError) {
              console.error(generationError);

              return res.status(500).json({
                message:
                  "Task updated, but generating the next occurrence failed.",
              });
            }

            return res.status(200).json({
              message: "Task updated successfully",
              nextOccurrenceId: newTaskId || null,
            });
          });
        });
      } else {
        return res.status(200).json({
          message: "Task updated successfully",
        });
      }
    },
  );
});





router.delete("/:id",(req,res)=>{
    pool.query("DELETE FROM tasks where id = ?",[req.params.id],(err,result)=>{
        if(err) return res.status(500).json({message: err.message});
        if(result.affectedRow === 0) return res.status(404).json({message:'task not found'});
        res.status(200).json({message:"task deleted"});
    })
})
module.exports = router;