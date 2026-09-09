-- CreateTable
CREATE TABLE "research_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "request" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "chosen_option_id" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "dismissed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "research_sessions_user_id_created_at_idx" ON "research_sessions"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "research_sessions" ADD CONSTRAINT "research_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
