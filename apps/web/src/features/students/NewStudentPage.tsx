import { Navigate, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createStudentSchema, type CreateStudentInput } from "@scholametric/shared";
import { PageHeader } from "../../components/PageHeader";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Spinner } from "../../components/ui/spinner";
import { ApiError, getErrorMessage } from "../../lib/api-client";
import { StudentBioFields } from "./StudentBioFields";
import { StudentGuardianFields } from "./StudentGuardianFields";
import { StudentClassFields } from "./StudentClassFields";
import { useCreateStudent } from "./use-create-student";
import { useCurrentUser } from "../shell/use-current-user";

export function NewStudentPage() {
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const createStudent = useCreateStudent();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CreateStudentInput>({
    resolver: zodResolver(createStudentSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      middleName: "",
      gender: undefined,
      dateOfBirth: "",
      guardianName: "",
      guardianPhone: "",
      guardianEmail: "",
      address: "",
      classArmId: "",
      admissionNumber: "",
    },
  });

  // Redirect if a TEACHER somehow lands here directly (button is absent for
  // them, but the route itself should still refuse too). Must wait for
  // /auth/me to actually resolve first — redirecting while it's merely
  // *loading* would bounce every user, including legitimate SCHOOL_ADMINs,
  // before their role is even known.
  if (currentUser.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Loading…
      </div>
    );
  }
  if (currentUser.data?.role !== "SCHOOL_ADMIN") {
    return <Navigate to="/students" replace />;
  }

  const onSubmit = handleSubmit((values) => {
    createStudent.mutate(values, {
      onSuccess: (student) => navigate(`/students/${student.id}`),
      onError: (error) => {
        if (error instanceof ApiError && error.status === 409) {
          setError("admissionNumber", { message: error.message });
        }
      },
    });
  });

  const showGenericError = createStudent.isError && !(createStudent.error instanceof ApiError && createStudent.error.status === 409);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New student" description="Bio, guardian, and class details." />

      <Card>
        <CardContent className="pt-6">
          <form className="flex flex-col gap-6" onSubmit={onSubmit} noValidate>
            <StudentBioFields register={register} errors={errors} />
            <StudentGuardianFields register={register} errors={errors} />
            <StudentClassFields register={register} errors={errors} />

            {showGenericError && (
              <p role="alert" className="text-sm text-danger">
                {getErrorMessage(createStudent.error)}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate("/students")}>
                Cancel
              </Button>
              <Button type="submit" disabled={createStudent.isPending}>
                {createStudent.isPending && <Spinner className="mr-2" />}
                Create student
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
