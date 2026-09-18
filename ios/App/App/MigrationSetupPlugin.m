#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(MigrationSetupPlugin, "MigrationSetupPlugin",
  CAP_PLUGIN_METHOD(prepareiOSDatabases, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(readRealmData, CAPPluginReturnPromise);
)
