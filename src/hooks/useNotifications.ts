import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useState } from "react";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function useNotifications() {
  const [permissionStatus, setPermissionStatus] = useState<Notifications.PermissionStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const current = await Notifications.getPermissionsAsync();
      if (mounted) {
        setPermissionStatus(current.status);
      }
    }
    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const requestPermission = useCallback(async () => {
    const next = await Notifications.requestPermissionsAsync();
    setPermissionStatus(next.status);
    return next.status;
  }, []);

  const notify = useCallback(
    async (title: string, body: string) => {
      if (permissionStatus !== "granted") {
        return;
      }

      await Notifications.scheduleNotificationAsync({
        content: { title, body },
        trigger: null,
      });
    },
    [permissionStatus]
  );

  return {
    permissionStatus,
    requestPermission,
    notify,
  };
}
