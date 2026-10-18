ALTER TABLE "Post" ADD COLUMN "battle" JSONB;
ALTER TABLE "Post" ADD CONSTRAINT "Post_battle_details_check" CHECK (
    "battle" IS NULL OR (
        "board" = 'FRIENDLY'
        AND jsonb_typeof("battle") = 'object'
        AND "battle" ? 'mode'
        AND jsonb_typeof("battle"->'mode') = 'string'
        AND "battle"->>'mode' IN ('DUEL', 'TEAM')
    )
);
