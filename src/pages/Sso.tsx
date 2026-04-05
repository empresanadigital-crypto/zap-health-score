import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

const Sso = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("Conectando...");
  const [error, setError] = useState(false);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) { setStatus("Link inválido"); setError(true); return; }

    const doSsoLogin = async () => {
      try {
        setStatus("Validando acesso...");
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sso-login`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }
        );
        const data = await res.json();
        if (!data.success || !data.loginUrl) { setStatus("Token expirado ou inválido. Faça login normalmente."); setError(true); return; }
        setStatus("Entrando...");
        window.location.href = data.loginUrl;
      } catch (e) {
        console.error("[SSO] Error:", e);
        setStatus("Erro na conexão. Tente novamente.");
        setError(true);
      }
    };
    doSsoLogin();
  }, [searchParams]);

  return (
    <div style={{ minHeight: "100vh", background: "#08090e", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Outfit', sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.03em", background: "linear-gradient(135deg, #3b82f6, #18f26a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 16 }}>
          CheckZap
        </div>
        {!error && (
          <div style={{ width: 28, height: 28, border: "3px solid rgba(59,130,246,0.3)", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
        )}
        <div style={{ fontSize: 14, color: error ? "#ef4444" : "rgba(242,242,255,0.5)" }}>{status}</div>
        {error && (
          <a href="/login" style={{ display: "inline-block", marginTop: 20, fontSize: 13, color: "#3b82f6", textDecoration: "none" }}>
            Ir para o login
          </a>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default Sso;
