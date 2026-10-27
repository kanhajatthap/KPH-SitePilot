ALTER TABLE public.dashboard_chat_history
  ADD COLUMN conversations JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN active_conversation_id UUID;

UPDATE public.dashboard_chat_history
SET conversations = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid(),
    'title', COALESCE(
      NULLIF(left(btrim((
        SELECT message->>'content'
        FROM jsonb_array_elements(messages) AS item(message)
        WHERE message->>'role' = 'user'
        LIMIT 1
      )), 100), ''),
      'Previous conversation'
    ),
    'createdAt', to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt', to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'messages', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_strip_nulls(jsonb_build_object(
            'id', message->'id',
            'role', message->'role',
            'content', left(message->>'content', 10000),
            'timestamp', message->'timestamp',
            'status', message->'status',
            'targetSite', message->'targetSite'
          ))
          ORDER BY ordinal
        )
        FROM jsonb_array_elements(messages) WITH ORDINALITY AS item(message, ordinal)
        WHERE message->>'role' IN ('user', 'assistant')
      ),
      '[]'::jsonb
    )
  )
)
WHERE jsonb_typeof(messages) = 'array'
  AND jsonb_array_length(messages) > 0;

UPDATE public.dashboard_chat_history
SET active_conversation_id = (conversations->0->>'id')::uuid
WHERE jsonb_array_length(conversations) > 0;

ALTER TABLE public.dashboard_chat_history
  DROP CONSTRAINT dashboard_chat_history_messages_check,
  DROP COLUMN messages,
  ADD CONSTRAINT dashboard_chat_history_conversations_check
    CHECK (
      CASE
        WHEN jsonb_typeof(conversations) = 'array'
          THEN jsonb_array_length(conversations) <= 50
            AND pg_column_size(conversations) <= 10485760
        ELSE false
      END
    );
