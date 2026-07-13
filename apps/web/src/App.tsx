import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LoginRoute } from "./app/LoginRoute";
import { ProtectedLayout } from "./app/ProtectedLayout";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { StudentsListPage } from "./features/students/StudentsListPage";
import { NewStudentPage } from "./features/students/NewStudentPage";
import { StudentDetailPage } from "./features/students/StudentDetailPage";
import { SettingsLayout } from "./features/settings/SettingsLayout";
import { SchoolProfilePage } from "./features/settings/SchoolProfilePage";
import { AcademicSettingsPage } from "./features/settings/AcademicSettingsPage";
import { UsersSettingsPage } from "./features/settings/UsersSettingsPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/students" element={<StudentsListPage />} />
          <Route path="/students/new" element={<NewStudentPage />} />
          <Route path="/students/:id" element={<StudentDetailPage />} />
          <Route path="/settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="/settings/school" replace />} />
            <Route path="school" element={<SchoolProfilePage />} />
            <Route path="academic" element={<AcademicSettingsPage />} />
            <Route path="users" element={<UsersSettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
