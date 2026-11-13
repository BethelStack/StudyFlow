import React from "react";
import { NavLink } from "react-router-dom";
function Sidebar() {
  return (
    <>
      <nav>
        <NavLink to="/">Dashboard</NavLink>
        <NavLink to="/tasks">My Tasks</NavLink>
        <NavLink to="/calendar">Calendar</NavLink>
        <NavLink to="/notifications">Notifications</NavLink>
        <NavLink to="/settings">Settings</NavLink>
        <NavLink to="/logout">Logout</NavLink>
      </nav>
    </>
  );
}
export default Sidebar;
