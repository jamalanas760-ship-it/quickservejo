import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { watchPublicOrder } from "@/lib/public-order-realtime";

export function usePublicOrderRealtime(token: string) {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);
  useEffect(
    () =>
      watchPublicOrder(
        supabase,
        token,
        () => {
          void queryClient.invalidateQueries({ queryKey: ["public-order-receipt", token] });
        },
        setLive,
      ),
    [queryClient, token],
  );
  return live;
}
