import { AuthButton } from "@coinbase/cdp-react/components/AuthButton";
import { SignInModal, SignInModalTrigger } from "@coinbase/cdp-react/components/SignInModal";

function CoinbaseAuthButton() {
  return (
    <AuthButton
      className="w-full"
      placeholder={(props) => (
        <div
          {...props}
          className="flex min-h-11 w-full items-center justify-center rounded-full border border-border/70 bg-background/70 px-4 text-sm text-muted-foreground"
        >
          Preparing secure sign-in...
        </div>
      )}
      signInModal={({ open, setIsOpen, onSuccess }) => (
        <SignInModal open={open} setIsOpen={setIsOpen} onSuccess={onSuccess}>
          <SignInModalTrigger
            fullWidth
            className="h-12 w-full rounded-full border border-primary/80 bg-primary text-base font-semibold text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-colors hover:bg-primary/92"
            label="Continue"
          />
        </SignInModal>
      )}
    />
  );
}

export default CoinbaseAuthButton;
