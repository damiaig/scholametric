import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createTermSchema, type CreateTermInput } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { FieldError } from "../../components/FieldError";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useCreateTerm } from "./use-terms";

interface CreateTermDialogProps {
  sessionId: string;
  open: boolean;
  onClose: () => void;
}

export function CreateTermDialog({ sessionId, open, onClose }: CreateTermDialogProps) {
  const createTerm = useCreateTerm();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateTermInput>({
    resolver: zodResolver(createTermSchema),
    defaultValues: { sessionId, name: undefined, startsOn: "", endsOn: "" },
  });

  const onSubmit = handleSubmit((values) => {
    createTerm.mutate(
      { ...values, sessionId },
      {
        onSuccess: () => {
          reset({ sessionId, name: undefined, startsOn: "", endsOn: "" });
          onClose();
        },
      },
    );
  });

  return (
    <Dialog open={open} onClose={onClose} title="New term">
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">New term</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="term-name">Term</Label>
          <Select id="term-name" defaultValue="" {...register("name")}>
            <option value="" disabled>
              Select a term…
            </option>
            <option value="FIRST">First term</option>
            <option value="SECOND">Second term</option>
            <option value="THIRD">Third term</option>
          </Select>
          <FieldError message={errors.name?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="term-starts">Starts on</Label>
          <Input id="term-starts" type="date" {...register("startsOn")} />
          <FieldError message={errors.startsOn?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="term-ends">Ends on</Label>
          <Input id="term-ends" type="date" {...register("endsOn")} />
          <FieldError message={errors.endsOn?.message} />
        </div>
        {createTerm.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(createTerm.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createTerm.isPending}>
            {createTerm.isPending && <Spinner className="mr-2" />}
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
