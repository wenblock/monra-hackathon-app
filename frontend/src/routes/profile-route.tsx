import ProfilePage from "@/ProfilePage";
import { usePersistedSolanaAddress } from "@/features/session/use-persisted-solana-address";
import { useSession } from "@/features/session/use-session";

function ProfileRouteComponent() {
  const { bridge, user } = useSession();
  const { effectiveSolanaAddress, persistenceError } = usePersistedSolanaAddress(
    user.cdpUserId,
    user.solanaAddress,
  );

  return (
    <ProfilePage
      bridge={bridge}
      user={user}
      walletAddress={effectiveSolanaAddress}
      walletSyncError={persistenceError}
    />
  );
}

export default ProfileRouteComponent;
