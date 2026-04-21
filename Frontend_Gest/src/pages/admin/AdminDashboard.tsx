export default function AdminDashboard() {
  return (
    <div className="relative min-h-screen bg-slate-900 text-slate-100" style={{ overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "url('/images/login-bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(4px)",
          transform: "scale(1.05)",
        }}
      />
      <div style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.45)" }} />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-5xl items-center px-8 py-12">
        <section className="w-full rounded-[24px] bg-white p-12 text-slate-900 shadow-2xl">
          <h1 className="text-3xl font-bold text-[#001f3f]">Administrador</h1>
        </section>
      </main>
    </div>
  );
}
