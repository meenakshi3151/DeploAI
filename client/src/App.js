import React, { useState } from "react";
import axios from "axios";
import "./App.css"; // custom CSS file

const App = () => {
  const [repoUrl, setRepoUrl] = useState("");
  const [port, setPort] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);

  const handleDeploy = async () => {
    setLoading(true);
    setResponse(null);
    setError(null);

    try {
      const payload = {
        repoUrl: repoUrl,
        config: {
          port: parseInt(port)
        }
      };

      const res = await axios.post("http://localhost:5000/run", payload);

      setResponse(res.data);
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="form-box">
        <h1 className="app-title">DeploAI</h1>

        <div className="form-group">
          <label>Git Repository URL</label>
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/..."
          />
        </div>

        <div className="form-group">
          <label>Port Number</label>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder="3000"
          />
        </div>

        <button onClick={handleDeploy} disabled={loading}>
          {loading ? "Deploying..." : "Deploy"}
        </button>

        {response && (
          <div className="response success">
            <pre>{JSON.stringify(response, null, 2)}</pre>
          </div>
        )}
        {error && (
          <div className="response error">
            Error: {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
