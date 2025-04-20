import cryptoRandomString from "crypto-random-string";
function Login() {
  const handleSignInWithGithub = () => {
    const CLIENT_ID = "Ov23liRoHSR2HpvJzGss"
    console.log(CLIENT_ID)
    const state = cryptoRandomString({ length: 10, type: "base64" });
    localStorage.setItem("latestCSRFToken", state);
    const redirectUri = "http://localhost:5000/api/github/callback";
    const link = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&response_type=code&scope=repo&redirect_uri=${redirectUri}&state=${state}`;
    
    // Redirect to GitHub OAuth page
    window.location.assign(link);
  };

  return (
    <div>
      <h1>Deplofy</h1>
      <p>Deploy your projects with ease</p>
      <button
        type="button"
        onClick={handleSignInWithGithub}
        className="py-2 px-4 bg-gray-600 hover:bg-gray-700 text-white"
      >
        Sign in with GitHub
      </button>
    </div>
  );
}

export default Login;