import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack?: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Uygulama beklenmedik bir hata verdi.",
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      stack: errorInfo.componentStack || error.stack,
    });
    console.error("POS runtime error:", error, errorInfo);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div style={{ minHeight: "100vh", padding: "24px", fontFamily: "Inter, system-ui, sans-serif", background: "#f8fafc", color: "#0f172a" }}>
        <h1 style={{ margin: 0, marginBottom: "12px", fontSize: "22px" }}>POS ekrani hata verdi</h1>
        <p style={{ marginTop: 0, marginBottom: "12px" }}>{this.state.message}</p>
        <p style={{ marginTop: 0, marginBottom: "12px" }}>Sayfayi yenileyin. Devam ederse ekran goruntusunu paylas, direkt cozeyim.</p>
        {this.state.stack ? (
          <pre style={{ whiteSpace: "pre-wrap", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "12px", maxWidth: "960px", overflowX: "auto" }}>
            {this.state.stack}
          </pre>
        ) : null}
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>,
);
