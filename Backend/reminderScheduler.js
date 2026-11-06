const pool = require("./db");

function checkReminders() {
  const sql = `
        SELECT id, title, user_id
        FROM tasks
        WHERE reminder_at IS NOT NULL
          AND reminder_at <= UTC_TIMESTAMP()
          AND reminder_sent = FALSE
          AND status != 'completed'
    `;

  pool.query(sql, (err, tasks) => {
    if (err) {
      console.error("Error checking reminders:", err.message);
      return;
    }

    tasks.forEach((task) => {
      // A notification needs a user to receive it.
      if (!task.user_id) {
        console.log(`Task ${task.id} has no assigned user. Skipping reminder.`);
        return;
      }

      const notificationSql = `
                INSERT INTO notifications (user_id, task_id, message)
                VALUES (?, ?, ?)
            `;

      const message = `Reminder: ${task.title} is due soon.`;

      pool.query(
        notificationSql,
        [task.user_id, task.id, message],
        (notificationError) => {
          if (notificationError) {
            console.error(
              "Error creating notification:",
              notificationError.message,
            );
            return;
          }

          const updateSql = `
                        UPDATE tasks
                        SET reminder_sent = TRUE
                        WHERE id = ? AND reminder_sent = FALSE
                    `;

          pool.query(updateSql, [task.id], (updateError) => {
            if (updateError) {
              console.error("Error updating reminder:", updateError.message);
              return;
            }

            console.log(`Notification created for: ${task.title}`);
          });
        },
      );
    });
  });
}

// Check immediately when the scheduler starts.
checkReminders();

// Check again every 30 seconds.
setInterval(checkReminders, 30000);
