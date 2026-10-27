ALTER TABLE public.dashboard_chat_history
  ADD COLUMN conversations JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN active_conversation_id UUID;

UPDATE public.dashboard_chat_history
SET conversations = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid(),
    'title', COALESCE(
      NULLIF(left((
        SELECT message->>'content'
        FROM jsonb_array_elements(messages) AS item(message)
        WHERE message->>'role' = 'user'
        LIMIT 1
      ), 100), ''),
      'Previous conversation'
    ),
    'createdAt', updated_at,
    'updatedAt', updated_at,
    'messages', messages
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
      jsonb_typeof(conversations) = 'array'
      AND jsonb_array_length(conversations) <= 50
      AND pg_column_size(conversations) <= 10485760
    );
