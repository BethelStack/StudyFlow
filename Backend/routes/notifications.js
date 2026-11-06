const express = require("express");
const router = express.Router();
const pool = require("../db");
const authenticateToken = require("../middleware/authenticateToken");

// Get the logged-in user's notifications
router.get("/", authenticateToken, (req, res) => {
  const userId = req.user.id;

  const sql = `
        SELECT *
        FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
    `;

  pool.query(sql, [userId], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Could not retrieve notifications.",
      });
    }

    res.json(results);
  });
});

// Mark a notification as read
router.put("/:id/read", authenticateToken, (req, res) => {
  const notificationId = req.params.id;
  const userId = req.user.id;

  const sql = `
        UPDATE notifications
        SET is_read = TRUE
        WHERE id = ? AND user_id = ?
    `;

  pool.query(sql, [notificationId, userId], (err, result) => {
    if (err) {
      return res.status(500).json({
        message: "Could not update notification.",
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Notification not found.",
      });
    }

    res.json({ message: "Notification marked as read." });
  });
});

module.exports = router;
