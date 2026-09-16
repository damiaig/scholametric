import { CircleAlert } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useClassSchoolDays, useSetClassSchoolDays } from "./use-class-school-days";

// v0.8 step 1 (SPEC_V0.8.md §7 item 1) — Mon-Fri is implicit and fixed for
// every class; the only knob is whether Saturday is ALSO a school day.
// Sunday has no control here at all — there is no field capable of
// expressing it (schema.prisma's ClassSchoolDays, use-class-school-days.ts's
// SetClassSchoolDaysInput). Direct toggle-on-change, no dialog: this is a
// single boolean per row, a confirm step would be pure friction.
export function ClassSchoolDaysSection() {
  const classSchoolDays = useClassSchoolDays();
  const setClassSchoolDays = useSetClassSchoolDays();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-text">Class school-days</h2>
        <p className="text-sm text-muted">Every class has school Monday-Friday. Saturday is opt-in, per class. Sunday is never a school day.</p>
      </div>

      {classSchoolDays.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading classes…
        </p>
      )}

      {classSchoolDays.isError && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-muted/20 bg-card p-10 text-center">
          <CircleAlert className="h-8 w-8 text-danger" aria-hidden="true" />
          <p className="text-sm text-danger">{getErrorMessage(classSchoolDays.error, "Couldn't load classes.")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => classSchoolDays.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {classSchoolDays.data && classSchoolDays.data.length === 0 && (
        <div className="rounded-lg border border-muted/20 bg-card p-10 text-center">
          <p className="text-sm text-muted">No classes yet. Add a class arm first.</p>
        </div>
      )}

      {classSchoolDays.data && classSchoolDays.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-muted/20 bg-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-muted/20">
                <th className="px-4 py-3 font-medium text-muted">Class</th>
                <th className="px-4 py-3 font-medium text-muted">Saturday</th>
              </tr>
            </thead>
            <tbody>
              {classSchoolDays.data.map((row) => {
                const isSaving = setClassSchoolDays.isPending && setClassSchoolDays.variables?.classArmId === row.classArmId;
                return (
                  <tr key={row.classArmId} className="border-b border-muted/10 last:border-0">
                    <td className="px-4 py-3 text-text">
                      {row.classLevelName} {row.classArmName}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          aria-label={`${row.classLevelName} ${row.classArmName} has school on Saturday`}
                          checked={row.includesSaturday}
                          disabled={isSaving}
                          onChange={(e) => setClassSchoolDays.mutate({ classArmId: row.classArmId, input: { includesSaturday: e.target.checked } })}
                        />
                        {isSaving && <Spinner className="h-3.5 w-3.5" />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {setClassSchoolDays.isError && (
        <p role="alert" className="text-sm text-danger">
          {getErrorMessage(setClassSchoolDays.error)}
        </p>
      )}
    </div>
  );
}
