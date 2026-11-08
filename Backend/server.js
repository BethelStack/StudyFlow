const express = require("express");
const cors = require("cors");
require("dotenv").config();

const initializeDatabase = require("./initDatabase");
const startReminderScheduler = require("./reminderScheduler");
const app = express();

const taskRoutes = require("./routes/tasks");
const authRoutes = require("./routes/auth");
const notificationRoutes = require("./routes/notifications");
const errorHandler = require("./middleware/errorHandler");

app.use(cors());
app.use(express.json());

// Routes
app.use("/tasks", taskRoutes);
app.use("/auth", authRoutes);
app.use("/notifications", notificationRoutes);

// Home route
app.get("/", (req, res) => {
  res.status(200).send("Welcome to StudyFlow.");
});

app.get("/api", (req, res) => {
  res.status(200).send("StudyFlow server is working.");
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    message: "Route not found.",
  });
});

// Error handler
app.use(errorHandler);

// Initialize database before starting server
const PORT = process.env.PORT || 3000;

initializeDatabase()
  .then(() => {
    startReminderScheduler();

    app.listen(PORT, () => {
      console.log(`StudyFlow server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });