import React from 'react'
import {Bell,Search,CircleUserRound} from "lucide-react";
import {Link,NavLink} from "react-router-dom";

 function Header() {
  return (
    <header>
      <Link to="/">StudyFlow</Link>
      <div>
        <Search />
        <input type="text" placeholder="search tasks..." />
      </div>
      <NavLink to="/notifications">
        
        <Bell size={20} />
      </NavLink>
      <button type="button">
        
        <CircleUserRound size={24} />
      </button>
    </header>
  );
}
export default Header;