import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getToken } from './storage';

interface RequireAuthProps {
  redirectTo?: string;
}

export default function RequireAuth({ redirectTo = '/login' }: RequireAuthProps) {
  const token = getToken();
  const location = useLocation();

  if (!token) {
    return <Navigate to={redirectTo} replace state={{ from: location }} />;
  }

  return <Outlet />;
}

