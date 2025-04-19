import React, { useState } from "react";
import axios from "axios";

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
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <div className="bg-white shadow-lg rounded-xl p-6 w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold text-center text-gray-800">DeploAI</h1>

        <div>
          <label className="block text-sm font-medium text-gray-600">Git Repository URL</label>
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            className="w-full mt-1 p-2 border border-gray-300 rounded"
            placeholder="https://github.com/..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600">Port Number</label>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            className="w-full mt-1 p-2 border border-gray-300 rounded"
            placeholder="3000"
          />
        </div>

        <button
          onClick={handleDeploy}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Deploying..." : "Deploy"}
        </button>

        {response && (
          <div className="mt-4 text-green-600 text-sm break-all">
            <pre>{JSON.stringify(response, null, 2)}</pre>
          </div>
        )}
        {error && (
          <div className="mt-4 text-red-600 text-sm">
            Error: {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
