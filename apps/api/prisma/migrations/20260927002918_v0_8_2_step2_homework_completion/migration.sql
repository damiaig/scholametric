-- CreateTable
CREATE TABLE "homework_completions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "homework_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "marked_done" BOOLEAN NOT NULL DEFAULT false,
    "marked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_completions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "homework_completions_school_id_student_id_idx" ON "homework_completions"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "homework_completions_homework_id_student_id_key" ON "homework_completions"("homework_id", "student_id");

-- AddForeignKey
ALTER TABLE "homework_completions" ADD CONSTRAINT "homework_completions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_completions" ADD CONSTRAINT "homework_completions_homework_id_fkey" FOREIGN KEY ("homework_id") REFERENCES "homework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_completions" ADD CONSTRAINT "homework_completions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
