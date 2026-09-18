import Capacitor
import UIKit

class MainBridgeViewController: CAPBridgeViewController {
  override func capacitorDidLoad() {
    super.capacitorDidLoad()
    bridge?.registerPluginInstance(MigrationSetupPlugin())
    bridge?.registerPluginInstance(PrivateKeyStorePlugin())
  }
}
