import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';

// Temporary: replaced by the real app shell.
export default function App() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>AirRemote</Text>
      <StatusBar style="auto" />
    </View>
  );
}
