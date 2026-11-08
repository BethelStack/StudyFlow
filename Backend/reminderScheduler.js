const pool = require("./db");

let isChecking = false;

function checkReminders() {
  // Prevent overlapping checks in this server instance
  if (isChecking) {
    return;
  }

  isChecking = true;

  const sql = `
        SELECT id, title, user_id
        FROM tasks
        WHERE reminder_at IS NOT NULL
        AND reminder_at <= UTC_TIMESTAMP()
        AND reminder_sent = FALSE
        AND status != 'completed'
        AND user_id IS NOT NULL
    `;

  pool.query(sql, (err, tasks) => {
    if (err) {
      console.error("Error checking reminders:", err);
      isChecking = false;
      return;
    }

    let index = 0;

    function processNextTask() {
      if (index >= tasks.length) {
        isChecking = false;
        return;
      }

      const task = tasks[index++];

      pool.getConnection((connectionError, connection) => {
        if (connectionError) {
          console.error(connectionError);
          return processNextTask();
        }

        connection.beginTransaction((transactionError) => {
          if (transactionError) {
            connection.release();
            console.error(transactionError);
            return processNextTask();
          }

          // Claim this reminder first
          const claimSql = `
                        UPDATE tasks
                        SET reminder_sent = TRUE
                        WHERE id = ?
                        AND reminder_sent = FALSE
                        AND reminder_at <= UTC_TIMESTAMP()
                        AND status != 'completed'
                    `;

          connection.query(claimSql, [task.id], (claimError, result) => {
            if (claimError) {
              return connection.rollback(() => {
                connection.release();
                console.error(claimError);
                processNextTask();
              });
            }

            // Already claimed by another check
            if (result.affectedRows === 0) {
              return connection.commit(() => {
                connection.release();
                processNextTask();
              });
            }

            const notificationSql = `
                                INSERT INTO notifications
                                (user_id, task_id, message)
                                VALUES (?, ?, ?)
                            `;

            const message = `Reminder: ${task.title} is due soon.`;

            connection.query(
              notificationSql,
              [task.user_id, task.id, message],
              (notificationError) => {
                if (notificationError) {
                  return connection.rollback(() => {
                    connection.release();
                    console.error(notificationError);
                    processNextTask();
                  });
                }

                connection.commit((commitError) => {
                  if (commitError) {
                    return connection.rollback(() => {
                      connection.release();
                      console.error(commitError);
                      processNextTask();
                    });
                  }

                  connection.release();

                  console.log(
                    `Reminder notification created for task ${task.id}.`,
                  );

                  processNextTask();
                });
              },
            );
          });
        });
      });
    }

    processNextTask();
  });
}

// Start checking reminders
function startReminderScheduler() {
  console.log("Reminder scheduler started.");

  checkReminders();

  setInterval(checkReminders, 30000);
}

module.exports = startReminderScheduler;
