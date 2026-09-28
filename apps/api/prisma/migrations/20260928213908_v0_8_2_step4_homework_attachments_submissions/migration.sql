-- CreateTable
CREATE TABLE "homework_attachments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "homework_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homework_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_submissions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "homework_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homework_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "homework_attachments_school_id_homework_id_idx" ON "homework_attachments"("school_id", "homework_id");

-- CreateIndex
CREATE INDEX "homework_submissions_school_id_homework_id_student_id_idx" ON "homework_submissions"("school_id", "homework_id", "student_id");

-- AddForeignKey
ALTER TABLE "homework_attachments" ADD CONSTRAINT "homework_attachments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_attachments" ADD CONSTRAINT "homework_attachments_homework_id_fkey" FOREIGN KEY ("homework_id") REFERENCES "homework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_homework_id_fkey" FOREIGN KEY ("homework_id") REFERENCES "homework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
