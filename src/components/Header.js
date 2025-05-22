import React from "react";
import { auth } from "../firebase";

export default function Header({ user, onLogout }) {
  const handleLogout = () => {
    auth.signOut().then(onLogout);
  };

  return (
    <div className="custom-header homepage-header">
      <div className="header-content">
        <span className="site-name">OMEGLE</span>
        <div className="user-info">
          <span className="user-name">{user.displayName}</span>
          <button onClick={handleLogout} className="btn logout-btn">
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
