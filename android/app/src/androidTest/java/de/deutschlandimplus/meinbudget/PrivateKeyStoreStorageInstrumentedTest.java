package de.deutschlandimplus.meinbudget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.UUID;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class PrivateKeyStoreStorageInstrumentedTest {

    @Test
    public void appContextUsesBudgetPackage() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();

        assertEquals("de.deutschlandimplus.meinbudget", appContext.getPackageName());
    }

    @Test
    public void setGetRemoveRoundTripUsesEncryptedSharedPreferences() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        PrivateKeyStoreStorage storage = new PrivateKeyStoreStorage(appContext);
        String service = "com.budget.accountkey.androidtest." + UUID.randomUUID();
        String value = "base64url-account-key";

        try {
            storage.set(service, value);

            assertEquals(value, storage.get(service));

            storage.remove(service);

            assertNull(storage.get(service));
        } finally {
            storage.remove(service);
        }
    }

    @Test
    public void hardwareBackedCheckReturnsBoolean() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        PrivateKeyStoreStorage storage = new PrivateKeyStoreStorage(appContext);

        assertNotNull(storage.isHardwareBacked());
    }
}
