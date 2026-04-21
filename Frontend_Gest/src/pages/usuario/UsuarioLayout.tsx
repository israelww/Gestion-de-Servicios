  import { Outlet, useLocation, useNavigate } from "react-router-dom";
  import Sidebar from "../../components/layout/Sidebar";
  import { usuarioPathForView, usuarioSidebarGroups, usuarioViewFromPath, type UsuarioView } from "./usuarioNavigation";

  export default function UsuarioLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const activeView = usuarioViewFromPath(location.pathname);

    const onNavigate = (view: string) => {
      navigate(usuarioPathForView(view as UsuarioView));
    };

    return (
      <div className="relative min-h-screen bg-slate-900 text-slate-100 overflow-hidden">
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

        <div className="relative z-10 min-h-screen">
          <Sidebar activeView={activeView} onNavigate={onNavigate} groups={usuarioSidebarGroups} />
          <main className="min-h-screen pl-[250px]">
            <div className="px-12 py-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    );
  }
