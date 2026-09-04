import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LoginRoute } from "./app/LoginRoute";
import { ChangePasswordRoute } from "./app/ChangePasswordRoute";
import { ProtectedLayout } from "./app/ProtectedLayout";
import { RequireSchoolAdmin } from "./app/RequireSchoolAdmin";
import { RequireTeacher } from "./app/RequireTeacher";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { StudentsListPage } from "./features/students/StudentsListPage";
import { NewStudentPage } from "./features/students/NewStudentPage";
import { StudentDetailPage } from "./features/students/StudentDetailPage";
import { TeachersListPage } from "./features/teachers/TeachersListPage";
import { TeacherDetailPage } from "./features/teachers/TeacherDetailPage";
import { ClassesPage } from "./features/classes/ClassesPage";
import { ClassArmDetailPage } from "./features/classes/ClassArmDetailPage";
import { ClassGradesPage } from "./features/grades/ClassGradesPage";
import { TeacherGradesPage } from "./features/grades/TeacherGradesPage";
import { ReviewPublishPage } from "./features/grades/ReviewPublishPage";
import { ReportCardPage } from "./features/grades/ReportCardPage";
import { MyGradesPage } from "./features/grades/MyGradesPage";
import { PersonnelListPage } from "./features/personnel/PersonnelListPage";
import { HelpPage } from "./features/help/HelpPage";
import { SettingsLayout } from "./features/settings/SettingsLayout";
import { SchoolProfilePage } from "./features/settings/SchoolProfilePage";
import { AcademicSettingsPage } from "./features/settings/AcademicSettingsPage";
import { PortalAccountsSettingsPage } from "./features/portal-accounts/PortalAccountsSettingsPage";
import { ClassArmCredentialSlipsPage } from "./features/portal-accounts/ClassArmCredentialSlipsPage";
import { AccountChangePasswordPage } from "./features/auth/AccountChangePasswordPage";

// Extracted from <App> (which just wraps this in <BrowserRouter>) so the
// route-smoke test can mount the exact same route tree inside a
// <MemoryRouter> — one definition, so a route added here is automatically
// covered by that test rather than needing a second, driftable copy.
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/change-password" element={<ChangePasswordRoute />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/students" element={<StudentsListPage />} />
        <Route path="/students/new" element={<NewStudentPage />} />
        <Route path="/students/:id" element={<StudentDetailPage />} />
        <Route path="/students/:id/report-card" element={<ReportCardPage />} />
        <Route path="/me/grades" element={<MyGradesPage />} />
        <Route path="/teachers" element={<TeachersListPage />} />
        <Route path="/teachers/:id" element={<TeacherDetailPage />} />
        <Route path="/classes" element={<ClassesPage />} />
        <Route path="/classes/arms/:id" element={<ClassArmDetailPage />} />
        <Route path="/classes/arms/:id/grades" element={<ClassGradesPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route
          path="/account/change-password"
          element={<AccountChangePasswordPage />}
        />

        {/* v0.2 (SPEC_V0.2.md §4): /settings/users no longer exists as a
            tab — it's a bare redirect to /personnel, which replaced it. */}
        <Route
          path="/settings/users"
          element={<Navigate to="/personnel" replace />}
        />

        {/* v0.7.2 — the pick-a-class Grades landing page, TEACHER-only
            (mirrors RequireSchoolAdmin's shape below). */}
        <Route element={<RequireTeacher />}>
          <Route path="/grades" element={<TeacherGradesPage />} />
        </Route>

        <Route element={<RequireSchoolAdmin />}>
          <Route path="/personnel" element={<PersonnelListPage />} />
          <Route path="/grades/review" element={<ReviewPublishPage />} />
          <Route
            path="/classes/arms/:id/credential-slips"
            element={<ClassArmCredentialSlipsPage />}
          />
        </Route>

        <Route path="/settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="/settings/school" replace />} />
          <Route path="school" element={<SchoolProfilePage />} />
          <Route path="academic" element={<AcademicSettingsPage />} />
          <Route
            path="portal-accounts"
            element={<PortalAccountsSettingsPage />}
          />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
