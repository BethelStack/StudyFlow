function validateTask(task){
    const { title, category, priority, status, due_date } = task ;
    const categories = [
        "University",
        "Daily life",
        "personal"
    ]
    const priorities = ['high','medium','low'];
    const statuses = ['pending','in-progress','completed'];
    if(typeof title !== 'string' || title.trim() === ''){
        return "title is required"; 
     }
     if(!categories.includes(category)){
        return "invalid category"
     }
     if(!priorities.includes(priority)){
        return " priority must be high,medium or low";
     }
     if(!statuses.includes(status)){
        return "invalid status";
     }
      if (due_date !== undefined && due_date !== null && due_date !== "") {
        if (
          typeof due_date !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(due_date) ||
          !Number.isFinite(Date.parse(due_date)) ||
          new Date(due_date).toISOString().slice(0, 10) !== due_date
        ) {
          return "Due date must be a valid date in YYYY-MM-DD format";
        }
      }

      return null;
}
module.exports = validateTask;