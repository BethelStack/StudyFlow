import { useEffect, useState } from "react";
import api from "./services/api";

function App() {
  const [message, setMessage] = useState("Connecting...");

  useEffect(() => {
    api
      .get("/api")
      .then((response) => {
        setMessage(response.data);
      })
      .catch((error) => {
        console.error(error);
        setMessage("Backend connection failed.");
      });
  }, []);

  return (
    <div>
      <h1>StudyFlow</h1>
      <p>{message}</p>
    </div>
  );
}

export default App;
