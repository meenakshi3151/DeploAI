import { useEffect, useState } from "react";

function Home() {
  const [token, setToken] = useState(null);
  const [repoUrls, setRepoUrls] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [publicUrl, setPublicUrl] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get("token");
    const reposString = params.get("repos");

    if (accessToken) {
      setToken(accessToken);
      localStorage.removeItem("latestCSRFToken");
    }

    if (reposString) {
      try {
        const parsedRepos = JSON.parse(decodeURIComponent(reposString));
        setRepoUrls(parsedRepos);
        if (parsedRepos.length > 0) {
          setSelectedRepo(parsedRepos[0]); // default selection
        }
      } catch (err) {
        console.error("Failed to parse repos", err);
      }
    }
  }, []);

  const handleGenerateClick = () => {
    if (selectedRepo) {
      // In real case, you could do something like generate a share link, trigger a backend call, etc.
      setPublicUrl(selectedRepo);
    }
  };

  return (
    <div>
      <h1>Home</h1>
      <p>Welcome to the home page!</p>

      {repoUrls.length > 0 && (
        <div>
          <h2>Repositories</h2>
          <select
            value={selectedRepo}
            onChange={(e) => setSelectedRepo(e.target.value)}
          >
            {repoUrls.map((url, index) => (
              <option key={index} value={url}>
                {url}
              </option>
            ))}
          </select>

          <button onClick={handleGenerateClick} style={{ marginLeft: "10px" }}>
            Generate Public URL
          </button>

          {publicUrl && (
            <div style={{ marginTop: "20px" }}>
              <p><strong>Public URL:</strong></p>
              <a href={publicUrl} target="_blank" rel="noopener noreferrer">{publicUrl}</a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Home;
