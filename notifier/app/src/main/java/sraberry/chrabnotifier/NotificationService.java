package sraberry.chrabnotifier;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import com.android.volley.Response;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Date;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

public class NotificationService extends Service {

    public static final String CHANNEL_ID = "chrab";
    public static final CharSequence NOTIFICATION_CHANNEL_TITLE = "chrab";
    public static final String NOTIFICATION_CHANNEL_DESCRIPTION = "chrab notifier";

    public static final int NOTIFICATION_THRESHOLD = 1000 * 60 * 2;  // milliseconds

    private JSONObject token;
    private int notificationId = 0;
    private ArrayList<Channel> channels;

    public NotificationService() {
    }

    @Override
    public IBinder onBind(Intent intent) {
        throw new UnsupportedOperationException("Not yet implemented");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        int foo = super.onStartCommand(intent, flags, startId);
        channels = new ArrayList<>();
        createNotificationChannel();
        try {
            token = new JSONObject(intent.getStringExtra(LoginActivity.EXTRA_TOKEN));
        } catch (JSONException e) {
            e.printStackTrace();
        }
        for (String channelString: intent.getStringArrayListExtra(MainActivity.EXTRA_CHANNELS)) {
            String[] split = channelString.split("\t");
            if (split.length == 1) {
                channels.add(new Channel(split[0], ""));
            } else if (split.length == 2 ) {
                channels.add(new Channel(split[0], split[1]));
            } else {
                Log.w("NotificationService", "Invalid channel: " + channelString);
            }
        }
        for (Channel channel: channels) {
            channel.ping(this, token);
        }
        Log.i("NotificationService", "Starting notification service.");
        return foo;

    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    NOTIFICATION_CHANNEL_TITLE,
                    NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription(NOTIFICATION_CHANNEL_DESCRIPTION);
            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
                Log.i("NotificationService", "Successfully created notification channel.");
            } else {
                Log.e("NotificationService", "Notification manager is null and "
                        + "notification channel could not be created.?");
            }
        }
    }

    @Override
    public void onDestroy() {
        Log.i("NotificationService", "Closing notification service.");
        super.onDestroy();
    }

    private void sendNotification(String channel, String author) {
        NotificationCompat.Builder mBuilder =
                new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("New message from " + author)
                .setContentText("New message from " + author + " on " + channel)
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setPriority(NotificationCompat.PRIORITY_MAX);
        NotificationManagerCompat notificationManager = NotificationManagerCompat.from(this);
        notificationManager.notify(notificationId, mBuilder.build());
        notificationId++;
    }

    private class Channel {
        private String name;
        private String password;
        private long lastMessage;  // in milliseconds

        private Channel(String name, String password) {
            this.name = name;
            this.password = password;
            this.lastMessage = 0;
        }

        private void ping(final Context context, final JSONObject token) {
            RequestSender.ping(context, token, name, password,
                    new Response.Listener<String>() {
                        @Override
                        public void onResponse(String response) {
                            Log.i("Ping", "New message on "
                                    + name + " from " + response);
                            long now = (new Date()).getTime();
                            try {

                                if (!token.getString("username").equals(response) &&
                                        (lastMessage == 0 ||
                                                (now - lastMessage) > NOTIFICATION_THRESHOLD)) {
                                    sendNotification(name, response);
                                }
                            } catch (JSONException e) {
                                e.printStackTrace();
                            }
                            lastMessage = now;
                            ping(context, token);
                        }
                    });
        }

    }

}
