import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LoginRoute } from "./app/LoginRoute";
import { ProtectedLayout } from "./app/ProtectedLayout";
import { RequireSchoolAdmin } from "./app/RequireSchoolAdmin";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { StudentsListPage } from "./features/students/StudentsListPage";
import { NewStudentPage } from "./features/students/NewStudentPage";
import { StudentDetailPage } from "./features/students/StudentDetailPage";
import { TeachersListPage } from "./features/teachers/TeachersListPage";
import { TeacherDetailPage } from "./features/teachers/TeacherDetailPage";
import { ClassesPage } from "./features/classes/ClassesPage";
import { ClassArmDetailPage } from "./features/classes/ClassArmDetailPage";
import { PersonnelListPage } from "./features/personnel/PersonnelListPage";
import { SettingsLayout } from "./features/settings/SettingsLayout";
import { SchoolProfilePage } from "./features/settings/SchoolProfilePage";
import { AcademicSettingsPage } from "./features/settings/AcademicSettingsPage";

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
          <Route path="/teachers" element={<TeachersListPage />} />
          <Route path="/teachers/:id" element={<TeacherDetailPage />} />
          <Route path="/classes" element={<ClassesPage />} />
          <Route path="/classes/arms/:id" element={<ClassArmDetailPage />} />

          {/* v0.2 (SPEC_V0.2.md §4): /settings/users no longer exists as a
              tab — it's a bare redirect to /personnel, which replaced it. */}
          <Route path="/settings/users" element={<Navigate to="/personnel" replace />} />

          <Route element={<RequireSchoolAdmin />}>
            <Route path="/personnel" element={<PersonnelListPage />} />
          </Route>

          <Route path="/settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="/settings/school" replace />} />
            <Route path="school" element={<SchoolProfilePage />} />
            <Route path="academic" element={<AcademicSettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
