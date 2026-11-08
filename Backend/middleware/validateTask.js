function validateTask(task) {
  const { title, description, category, priority, status, due_date } = task;

  const categories = [
    "University",
    "Learning",
    "Daily Life",
    "Goals",
    "Personal",
  ];

  const priorities = ["high", "medium", "low"];

  const statuses = ["pending", "in-progress", "completed"];

  if (typeof title !== "string" || title.trim() === "") {
    return "Title is required.";
  }

  if (title.trim().length > 200) {
    return "Title cannot exceed 200 characters.";
  }

  if (
    description !== undefined &&
    description !== null &&
    typeof description !== "string"
  ) {
    return "Description must be a string.";
  }

  if (!categories.includes(category)) {
    return "Invalid category.";
  }

  if (!priorities.includes(priority)) {
    return "Priority must be high, medium, or low.";
  }

  if (!statuses.includes(status)) {
    return "Invalid status.";
  }

  if (due_date !== undefined && due_date !== null && due_date !== "") {
    if (
      typeof due_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(due_date) ||
      !Number.isFinite(Date.parse(due_date)) ||
      new Date(due_date).toISOString().slice(0, 10) !== due_date
    ) {
      return "Due date must be a valid date in YYYY-MM-DD format.";
    }
  }

  return null;
}

module.exports = validateTask;
