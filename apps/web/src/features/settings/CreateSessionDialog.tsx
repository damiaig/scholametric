import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createSessionSchema, type CreateSessionInput } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { FieldError } from "../../components/FieldError";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useCreateSession } from "./use-sessions";

interface CreateSessionDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateSessionDialog({ open, onClose }: CreateSessionDialogProps) {
  const createSession = useCreateSession();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateSessionInput>({
    resolver: zodResolver(createSessionSchema),
    defaultValues: { name: "", startsOn: "", endsOn: "" },
  });

  const onSubmit = handleSubmit((values) => {
    createSession.mutate(values, {
      onSuccess: () => {
        reset();
        onClose();
      },
    });
  });

  return (
    <Dialog open={open} onClose={onClose} title="New session">
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">New session</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="session-name">Name</Label>
          <Input id="session-name" placeholder="e.g. 2027/2028" {...register("name")} />
          <FieldError message={errors.name?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="session-starts">Starts on</Label>
          <Input id="session-starts" type="date" {...register("startsOn")} />
          <FieldError message={errors.startsOn?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="session-ends">Ends on</Label>
          <Input id="session-ends" type="date" {...register("endsOn")} />
          <FieldError message={errors.endsOn?.message} />
        </div>
        {createSession.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(createSession.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createSession.isPending}>
            {createSession.isPending && <Spinner className="mr-2" />}
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
