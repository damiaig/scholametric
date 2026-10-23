-- CreateTable
CREATE TABLE "lesson_attachments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lesson_attachments_school_id_lesson_id_idx" ON "lesson_attachments"("school_id", "lesson_id");

-- AddForeignKey
ALTER TABLE "lesson_attachments" ADD CONSTRAINT "lesson_attachments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_attachments" ADD CONSTRAINT "lesson_attachments_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
