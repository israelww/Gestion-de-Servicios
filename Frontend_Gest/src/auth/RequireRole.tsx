import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getRole, type UserRole } from './storage';

interface RequireRoleProps {
  allow: UserRole[];
  redirectTo?: string;
}

export default function RequireRole({ allow, redirectTo = '/login' }: RequireRoleProps) {
  const rol = getRole();
  const location = useLocation();

  if (!rol) {
    return <Navigate to={redirectTo} replace state={{ from: location }} />;
  }

  if (!allow.includes(rol)) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

