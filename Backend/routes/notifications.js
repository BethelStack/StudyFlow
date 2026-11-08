const express = require("express");
const router = express.Router();
const pool = require("../db");
const authenticateToken = require("../middleware/authenticateToken");

// GET ALL NOTIFICATIONS
router.get("/", authenticateToken, (req, res, next) => {
  const sql = `
        SELECT 
            id,
            user_id,
            task_id,
            message,
            is_read,
            created_at
        FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
    `;

  pool.query(sql, [req.user.id], (err, results) => {
    if (err) {
      return next(err);
    }

    res.status(200).json(results);
  });
});

// GET UNREAD NOTIFICATIONS
router.get("/unread", authenticateToken, (req, res, next) => {
  const sql = `
        SELECT *
        FROM notifications
        WHERE user_id = ? AND is_read = FALSE
        ORDER BY created_at DESC
    `;

  pool.query(sql, [req.user.id], (err, results) => {
    if (err) {
      return next(err);
    }

    res.status(200).json(results);
  });
});

// GET NOTIFICATION COUNT
router.get("/unread/count", authenticateToken, (req, res, next) => {
  const sql = `
        SELECT COUNT(*) AS unreadCount
        FROM notifications
        WHERE user_id = ? AND is_read = FALSE
    `;

  pool.query(sql, [req.user.id], (err, results) => {
    if (err) {
      return next(err);
    }

    res.status(200).json({
      unreadCount: Number(results[0].unreadCount),
    });
  });
});

// MARK ONE NOTIFICATION AS READ
router.patch("/:id/read", authenticateToken, (req, res, next) => {
  const id = req.params.id;

  if (!/^\d+$/.test(id) || Number(id) < 1) {
    return res.status(400).json({
      message: "Invalid notification ID.",
    });
  }

  const sql = `
        UPDATE notifications
        SET is_read = TRUE
        WHERE id = ? AND user_id = ?
    `;

  pool.query(sql, [id, req.user.id], (err, result) => {
    if (err) {
      return next(err);
    }

    if (result.affectedRows === 0) {
      // Check whether it exists but was already read
      const checkSql = `
                SELECT id
                FROM notifications
                WHERE id = ? AND user_id = ?
            `;

      return pool.query(checkSql, [id, req.user.id], (checkError, rows) => {
        if (checkError) {
          return next(checkError);
        }

        if (rows.length === 0) {
          return res.status(404).json({
            message: "Notification not found.",
          });
        }

        res.status(200).json({
          message: "Notification is already marked as read.",
        });
      });
    }

    res.status(200).json({
      message: "Notification marked as read.",
    });
  });
});

// MARK ALL NOTIFICATIONS AS READ
router.patch("/read-all", authenticateToken, (req, res, next) => {
  const sql = `
        UPDATE notifications
        SET is_read = TRUE
        WHERE user_id = ? AND is_read = FALSE
    `;

  pool.query(sql, [req.user.id], (err, result) => {
    if (err) {
      return next(err);
    }

    res.status(200).json({
      message: "All notifications marked as read.",
      updatedCount: result.affectedRows,
    });
  });
});

// DELETE ONE NOTIFICATION
router.delete("/:id", authenticateToken, (req, res, next) => {
  const id = req.params.id;

  if (!/^\d+$/.test(id) || Number(id) < 1) {
    return res.status(400).json({
      message: "Invalid notification ID.",
    });
  }

  const sql = `
        DELETE FROM notifications
        WHERE id = ? AND user_id = ?
    `;

  pool.query(sql, [id, req.user.id], (err, result) => {
    if (err) {
      return next(err);
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Notification not found.",
      });
    }

    res.status(200).json({
      message: "Notification deleted successfully.",
    });
  });
});

module.exports = router;
