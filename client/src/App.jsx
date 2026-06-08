import { useAuth } from "./AuthContext.jsx";
import Login from "./Login.jsx";
import Dashboard from "./Dashboard.jsx";

export default function App() {
  const { isAuthed } = useAuth();
  return isAuthed ? <Dashboard /> : <Login />;
}
