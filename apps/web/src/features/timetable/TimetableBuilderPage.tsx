import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { WEEKDAYS, WEEKDAY_LABELS, type TimetableSlot, type WeekdayValue } from "@scholametric/shared";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Spinner } from "../../components/ui/spinner";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PageHeader } from "../../components/PageHeader";
import { getErrorMessage } from "../../lib/api-client";
import { useClassArmDetail } from "../classes/use-class-arm-detail";
import { useSessions } from "../settings/use-sessions";
import { usePeriods } from "../settings/use-periods";
import { useClassSchoolDays } from "../settings/use-class-school-days";
import { useTimetableSlots, useDeleteTimetableSlot } from "./use-timetable-slots";
import { TimetableSlotFormDialog } from "./TimetableSlotFormDialog";

interface SelectedCell {
  dayOfWeek: WeekdayValue;
  periodId: string;
  periodName: string;
  slot: TimetableSlot | null;
}

// v0.8 step 2 (SPEC_V0.8.md §7 item 2) — the proprietor/admin builder for
// one class's repeating weekly template. Reached from TimetableLandingPage
// (its own school-wide class browser), NOT from ClassArmDetailPage — that
// page went read-only for feature-area actions in v0.7.2 (grading UI moved
// to its own /grades namespace entirely); this follows the same pattern
// rather than reintroducing a cross-feature link there.
export function TimetableBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const classArmId = id ?? "";

  const armDetail = useClassArmDetail(classArmId, 1, 1);
  const sessions = useSessions(1, 50);
  const currentSessionId = useMemo(() => sessions.data?.items.find((s) => s.isCurrent)?.id ?? null, [sessions.data]);
  const periods = usePeriods();
  const classSchoolDays = useClassSchoolDays();
  const slots = useTimetableSlots(classArmId, currentSessionId);
  const deleteSlot = useDeleteTimetableSlot();

  const [selected, setSelected] = useState<SelectedCell | null>(null);
  const [deleting, setDeleting] = useState<TimetableSlot | null>(null);

  const includesSaturday = classSchoolDays.data?.find((row) => row.classArmId === classArmId)?.includesSaturday ?? false;
  const weekdays: WeekdayValue[] = includesSaturday ? [...WEEKDAYS] : WEEKDAYS.filter((d) => d !== "SATURDAY");

  const isLoading = armDetail.isLoading || sessions.isLoading || periods.isLoading || classSchoolDays.isLoading;
  const isError = armDetail.isError || sessions.isError || periods.isError || classSchoolDays.isError;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Loading timetable…
      </div>
    );
  }

  if (isError || !armDetail.data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-sm text-danger">
            {getErrorMessage(armDetail.error, "Couldn't load this class's timetable.")}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => armDetail.refetch()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!currentSessionId) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <p className="text-sm text-muted">No current academic session is configured for this school yet.</p>
        </CardContent>
      </Card>
    );
  }

  const arm = armDetail.data;
  const armLabel = `${arm.classLevel.name} ${arm.name}`;

  if (arm.subjectTeachers.length === 0) {
    return (
      <div>
        <Button type="button" variant="outline" size="sm" className="mb-4" onClick={() => navigate("/timetable")}>
          Back to Timetable
        </Button>
        <PageHeader title="Timetable" description={armLabel} />
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted">
              No subject teachers are assigned to {armLabel} yet — assign at least one from the class page before building its timetable.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  function findSlot(dayOfWeek: WeekdayValue, periodId: string): TimetableSlot | undefined {
    return slots.data?.find((slot) => slot.dayOfWeek === dayOfWeek && slot.periodId === periodId);
  }

  return (
    <div>
      <Button type="button" variant="outline" size="sm" className="mb-4" onClick={() => navigate("/timetable")}>
        Back to Timetable
      </Button>

      <PageHeader title="Timetable" description={armLabel} />

      {slots.isError && (
        <p role="alert" className="mb-4 text-sm text-danger">
          {getErrorMessage(slots.error, "Couldn't load this class's slots.")}
        </p>
      )}

      {(!periods.data || periods.data.length === 0) && (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted">
              No periods have been set up yet — add the school's bell schedule from Settings → Calendar first.
            </p>
          </CardContent>
        </Card>
      )}

      {periods.data && periods.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-muted/20 bg-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-muted/20">
                <th className="px-4 py-3 font-medium text-muted">Period</th>
                {weekdays.map((day) => (
                  <th key={day} className="px-4 py-3 font-medium text-muted">
                    {WEEKDAY_LABELS[day]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.data.map((period) => (
                <tr key={period.id} className="border-b border-muted/10 last:border-0">
                  <td className="px-4 py-3 font-medium text-text">
                    {period.name}
                    <div className="font-mono text-xs text-muted">
                      {period.startsAt}-{period.endsAt}
                    </div>
                  </td>
                  {weekdays.map((day) => {
                    const slot = findSlot(day, period.id);
                    return (
                      <td key={day} className="px-2 py-2 align-top">
                        {slot ? (
                          <div className="flex flex-col gap-1 rounded-md border border-primary/30 bg-primary/5 p-2">
                            <button
                              type="button"
                              className="text-left text-sm text-text hover:underline"
                              onClick={() => setSelected({ dayOfWeek: day, periodId: period.id, periodName: period.name, slot })}
                            >
                              <span className="font-medium">{slot.subjectName}</span>
                              <br />
                              <span className="text-xs text-muted">{slot.teacherName}</span>
                            </button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              aria-label={`Remove ${slot.subjectName} on ${WEEKDAY_LABELS[day]} ${period.name}`}
                              className="self-end text-danger hover:bg-danger/10"
                              onClick={() => setDeleting(slot)}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full"
                            aria-label={`Assign a subject on ${WEEKDAY_LABELS[day]} ${period.name}`}
                            onClick={() => setSelected({ dayOfWeek: day, periodId: period.id, periodName: period.name, slot: null })}
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <TimetableSlotFormDialog
          open={selected !== null}
          onClose={() => setSelected(null)}
          classArmId={classArmId}
          sessionId={currentSessionId}
          dayOfWeek={selected.dayOfWeek}
          periodId={selected.periodId}
          periodName={selected.periodName}
          subjectTeachers={arm.subjectTeachers}
          slot={selected.slot}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => {
          setDeleting(null);
          deleteSlot.reset();
        }}
        onConfirm={() =>
          deleting &&
          deleteSlot.mutate({ id: deleting.id, classArmId, sessionId: currentSessionId }, { onSuccess: () => setDeleting(null) })
        }
        title="Remove slot"
        description={deleting ? <>This removes <span className="font-semibold text-text">{deleting.subjectName}</span> from {WEEKDAY_LABELS[deleting.dayOfWeek]}&apos;s {deleting.periodName}.</> : undefined}
        confirmLabel="Remove"
        confirmTone="danger"
        isConfirming={deleteSlot.isPending}
      >
        {deleteSlot.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(deleteSlot.error)}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
