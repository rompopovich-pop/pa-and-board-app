import { useCallback, useEffect, useRef, useState } from "react";
import { Audio } from "expo-av";
import { API_URL, getAuthToken } from "../../api/client";

/** Plays one voice message at a time from the authenticated audio endpoint. */
export function useAudioPlayer() {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);

  const stop = useCallback(async () => {
    const sound = soundRef.current;
    soundRef.current = null;
    setPlayingUrl(null);
    if (sound) {
      await sound.unloadAsync().catch(() => {});
    }
  }, []);

  const play = useCallback(
    async (audioUrl: string) => {
      await stop();
      const token = await getAuthToken();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: `${API_URL}${audioUrl}`, headers: token ? { Authorization: `Bearer ${token}` } : undefined },
        { shouldPlay: true },
      );
      soundRef.current = sound;
      setPlayingUrl(audioUrl);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingUrl(null);
          soundRef.current = null;
          sound.unloadAsync().catch(() => {});
        }
      });
    },
    [stop],
  );

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  return { playingUrl, play, stop };
}
