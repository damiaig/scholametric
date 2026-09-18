import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LoginRoute } from "./app/LoginRoute";
import { ChangePasswordRoute } from "./app/ChangePasswordRoute";
import { ProtectedLayout } from "./app/ProtectedLayout";
import { RequireSchoolAdmin } from "./app/RequireSchoolAdmin";
import { RequireGradesAccess } from "./app/RequireGradesAccess";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { StudentsListPage } from "./features/students/StudentsListPage";
import { NewStudentPage } from "./features/students/NewStudentPage";
import { StudentDetailPage } from "./features/students/StudentDetailPage";
import { TeachersListPage } from "./features/teachers/TeachersListPage";
import { TeacherDetailPage } from "./features/teachers/TeacherDetailPage";
import { ClassesPage } from "./features/classes/ClassesPage";
import { ClassArmDetailPage } from "./features/classes/ClassArmDetailPage";
import { ClassGradesPage } from "./features/grades/ClassGradesPage";
import { GradesLandingPage } from "./features/grades/GradesLandingPage";
import { ReviewPublishPage } from "./features/grades/ReviewPublishPage";
import { ExamApprovalsPage } from "./features/grades/ExamApprovalsPage";
import { ReportCardPage } from "./features/grades/ReportCardPage";
import { MyGradesPage } from "./features/grades/MyGradesPage";
import { PersonnelListPage } from "./features/personnel/PersonnelListPage";
import { HelpPage } from "./features/help/HelpPage";
import { SettingsLayout } from "./features/settings/SettingsLayout";
import { SchoolProfilePage } from "./features/settings/SchoolProfilePage";
import { AcademicSettingsPage } from "./features/settings/AcademicSettingsPage";
import { CalendarSettingsPage } from "./features/settings/CalendarSettingsPage";
import { PortalAccountsSettingsPage } from "./features/portal-accounts/PortalAccountsSettingsPage";
import { ClassArmCredentialSlipsPage } from "./features/portal-accounts/ClassArmCredentialSlipsPage";
import { AccountChangePasswordPage } from "./features/auth/AccountChangePasswordPage";
import { TimetableLandingPage } from "./features/timetable/TimetableLandingPage";
import { TimetableBuilderPage } from "./features/timetable/TimetableBuilderPage";
import { TeacherTimetablePage } from "./features/timetable/TeacherTimetablePage";
import { MyTimetablePage } from "./features/timetable/MyTimetablePage";
import { AbsencesPage } from "./features/timetable/AbsencesPage";

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
        {/* v0.8 step 3 (SPEC_V0.8.md §7 item 3) — same "reachable by any
            authenticated role at the URL bar, server 403 is the real gate"
            pattern /me/grades already established: no client route guard
            on either of these, unlike /timetable (Step 2's builder) and
            /timetable/arms/:id below, which stay inside RequireSchoolAdmin. */}
        <Route path="/me/timetable" element={<MyTimetablePage />} />
        <Route path="/timetable/mine" element={<TeacherTimetablePage />} />
        <Route path="/teachers" element={<TeachersListPage />} />
        <Route path="/teachers/:id" element={<TeacherDetailPage />} />
        <Route path="/classes" element={<ClassesPage />} />
        <Route path="/classes/arms/:id" element={<ClassArmDetailPage />} />
        {/* v0.7.2 step 2 (SPEC_V0.7.2.md §3, item 2) — moved from
            /classes/arms/:id/grades: the class page no longer hosts any
            grading UI, so its grading route moves under /grades too.
            ClassGradesPage itself is unchanged code, unguarded here same
            as its predecessor (no client route guard existed on the old
            path either). */}
        <Route path="/grades/arms/:id" element={<ClassGradesPage />} />
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

        {/* v0.7.2 step 2 — the Grades landing page: TEACHER's own "my
            classes" picker, or SCHOOL_ADMIN/PROPRIETOR's school-wide
            browser (GradesLandingPage forks on role). Mirrors
            RequireSchoolAdmin's shape below. */}
        <Route element={<RequireGradesAccess />}>
          <Route path="/grades" element={<GradesLandingPage />} />
        </Route>

        <Route element={<RequireSchoolAdmin />}>
          <Route path="/personnel" element={<PersonnelListPage />} />
          <Route path="/grades/review" element={<ReviewPublishPage />} />
          <Route path="/grades/exam-approvals" element={<ExamApprovalsPage />} />
          <Route
            path="/classes/arms/:id/credential-slips"
            element={<ClassArmCredentialSlipsPage />}
          />
          {/* v0.8 step 2 (SPEC_V0.8.md §7 item 2) — its own top-level
              namespace, not nested under /classes/arms/:id, same reasoning
              as /grades/arms/:id's own move away from the class page
              (v0.7.2 step 2): a feature area with its own landing/browser
              page gets its own namespace; the class page itself stays
              read-only for feature actions. SCHOOL_ADMIN/PROPRIETOR only
              for now — no TEACHER path until a later v0.8 step. */}
          <Route path="/timetable" element={<TimetableLandingPage />} />
          <Route path="/timetable/arms/:id" element={<TimetableBuilderPage />} />
          {/* v0.8 step 4 (SPEC_V0.8.md §4) — linked from TimetableLandingPage
              only, same "occasional admin action" dashboard-card-not-sidebar
              precedent as the builder above. */}
          <Route path="/timetable/absences" element={<AbsencesPage />} />
        </Route>

        <Route path="/settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="/settings/school" replace />} />
          <Route path="school" element={<SchoolProfilePage />} />
          <Route path="academic" element={<AcademicSettingsPage />} />
          <Route path="calendar" element={<CalendarSettingsPage />} />
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
