import type { ReactNode } from "react";
import { PageHeader } from "../../components/PageHeader";
import { useCurrentUser } from "../shell/use-current-user";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6 rounded-lg border border-muted/20 bg-card p-4">
      <h2 className="mb-2 text-base font-semibold text-text">{title}</h2>
      <div className="flex flex-col gap-2 text-sm text-text">{children}</div>
    </section>
  );
}

// SPEC_V0.5.1.md §2.7, v0.5.1 step 6 (Q5 approved: a simple static per-role
// page, not a contextual/inline tour). Same "one route, role branches the
// content" pattern DashboardPage already uses for MyClassesView vs. the
// admin dashboard. Content is hand-written and role-scoped on purpose —
// the TEACHER guide describes ONLY actions a teacher can take (grade
// entry for their own classes/subjects, marking absent, the class remark
// when they're the class teacher); it never mentions publish, override,
// or term close/unlock, since a teacher has none of those powers and a
// guide describing them would just be confusing, not helpful.
export function HelpPage() {
  const { data: user } = useCurrentUser();

  if (user?.role === "TEACHER") {
    return (
      <div>
        <PageHeader title="Help" description="What your account can do, and how." />
        <TeacherHelp />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Help" description="What your account can do, and how." />
      <AdminHelp />
    </div>
  );
}

function AdminHelp() {
  return (
    <>
      <Section title="Setting up classes & subjects">
        <p>
          Add class levels and arms, then add subjects, from the Classes page. Open a class arm to assign its class
          teacher and its subject teachers.
        </p>
        <p className="text-muted">
          A subject only becomes gradeable for a class once a teacher is assigned to teach it there — assigning a
          teacher when you add a subject to a class is what unlocks grade entry, overview, and the report card for
          that class. If a subject seems to be missing from a class, check whether a teacher has been assigned to it
          there yet.
        </p>
      </Section>

      <Section title="Entering grades">
        <p>
          Grades are entered from a specific class and subject, not a free picker — open a class from the Classes
          page and click "Enter grades" next to the subject you want, or use a subject's "Enter grades" link
          wherever you see one. From there, pick the assessment component (e.g. CA 1, CA 2, Exam) and enter each
          student's score, or mark them absent.
        </p>
      </Section>

      <Section title="Reviewing & publishing">
        <p>
          The Grades overview page shows every subject's results for a class and term. Review &amp; publish shows
          each subject's readiness (draft / pending approval / published counts) and lets you publish a subject once
          its scores are complete.
        </p>
        <p>
          Override lets you set a manual grade label on a result, keeping the auto-computed grade on record
          underneath it. On an already-published result, only the proprietor can override the grade label.
        </p>
        <p>
          If a published result turns out to be wrong — a teacher entered a score but the student was actually
          absent, or the reverse — use "Correct a published result" on the Grades overview page. It recomputes the
          total and re-ranks the class, and the result stays published with the corrected numbers.
        </p>
      </Section>

      <Section title="Managing terms">
        <p>
          Closing a term locks its scores from further editing. If a correction is needed afterward, unlock that
          exact class and subject (with a reason), make the correction, then relock it when you're done.
        </p>
      </Section>

      <Section title="Assessment structure & grading scale">
        <p>
          Settings → Academic is where the assessment components (their names, weights, and which one requires
          approval before a result can publish) and the school's grading scale are configured.
        </p>
      </Section>
    </>
  );
}

function TeacherHelp() {
  return (
    <>
      <Section title="Your classes">
        <p>
          My Classes (this account's home page) lists the classes you're the class teacher of, and the subjects you
          teach. Open a class to see its enrolled students.
        </p>
      </Section>

      <Section title="Entering grades">
        <p>
          From My Classes, click "Enter grades" next to a subject you teach. Pick the assessment component (e.g.
          CA 1, CA 2, Exam), then enter each student's score. If a student was absent for that component, mark them
          absent instead of leaving it blank — absent is recorded as a decided outcome, not a missing score.
        </p>
        <p className="text-muted">
          Once a result is finalized, you won't be able to edit it yourself — if a correction is needed afterward,
          ask your school admin or proprietor.
        </p>
      </Section>

      <Section title="Class remarks">
        <p>
          If you're the class teacher of an arm, you can write the teacher's remark on a student's report card for
          that class. If you only teach a subject there (not the class teacher), you can still read the remark, but
          you can't edit it — that stays with the class teacher.
        </p>
      </Section>
    </>
  );
}
