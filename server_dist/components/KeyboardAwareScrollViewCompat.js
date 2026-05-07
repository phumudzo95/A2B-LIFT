// template
import { Platform, ScrollView } from "react-native";
import { KeyboardAwareScrollView, } from "react-native-keyboard-controller";
export function KeyboardAwareScrollViewCompat({ children, keyboardShouldPersistTaps = "handled", ...props }) {
    if (Platform.OS !== "ios") {
        return (<ScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...props}>
        {children}
      </ScrollView>);
    }
    return (<KeyboardAwareScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...props}>
      {children}
    </KeyboardAwareScrollView>);
}
