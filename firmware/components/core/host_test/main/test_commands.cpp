#include <cstring>
#include <string>

#include <unity.h>

#include "core/commands.hpp"

using Kind = core::Command::Kind;

TEST_CASE("wifi takes an SSID and a password", "[commands]") {
  auto command = core::parse_command("wifi Home secret123");
  TEST_ASSERT_TRUE(command.kind == Kind::Wifi);
  TEST_ASSERT_EQUAL_STRING("Home", command.wifi.ssid.c_str());
  TEST_ASSERT_EQUAL_STRING("secret123", command.wifi.password.c_str());
}

TEST_CASE("wifi without a password is an open network", "[commands]") {
  auto command = core::parse_command("wifi Home");
  TEST_ASSERT_TRUE(command.kind == Kind::Wifi);
  TEST_ASSERT_EQUAL_STRING("", command.wifi.password.c_str());
}

TEST_CASE("wifi takes a quoted SSID with spaces and escaped quotes", "[commands]") {
  auto command = core::parse_command(R"(wifi "My \"Home\"" secret123)");
  TEST_ASSERT_TRUE(command.kind == Kind::Wifi);
  TEST_ASSERT_EQUAL_STRING(R"(My "Home")", command.wifi.ssid.c_str());
  TEST_ASSERT_EQUAL_STRING("secret123", command.wifi.password.c_str());
}

TEST_CASE("wifi refuses an SSID or password of the wrong length", "[commands]") {
  const std::string ssid33(33, 's');
  for (const std::string &line :
       {"wifi " + ssid33 + " secret123", std::string("wifi Home short12"),
        "wifi Home " + std::string(64, 'p'), std::string("wifi"),
        std::string("wifi a b c")}) {
    auto command = core::parse_command(line);
    TEST_ASSERT_TRUE_MESSAGE(command.kind == Kind::Invalid, line.c_str());
    TEST_ASSERT_NOT_NULL(strstr(command.error.c_str(), "wifi <ssid> [password]"));
  }
  TEST_ASSERT_TRUE(core::parse_command("wifi " + std::string(32, 's') + " " +
                                       std::string(63, 'p'))
                       .kind == Kind::Wifi);
  TEST_ASSERT_TRUE(core::parse_command("wifi Home 12345678").kind == Kind::Wifi);
}

TEST_CASE("ir is a command of its own", "[commands]") {
  TEST_ASSERT_TRUE(core::parse_command("ir").kind == Kind::Ir);
  TEST_ASSERT_TRUE(core::parse_command("ir now").kind == Kind::Invalid);
  TEST_ASSERT_TRUE(core::parse_command("ir selftest").kind == Kind::IrSelfTest);
}

TEST_CASE("pair, status and help, with surrounding spaces", "[commands]") {
  TEST_ASSERT_TRUE(core::parse_command("pair").kind == Kind::Pair);
  TEST_ASSERT_TRUE(core::parse_command("  status  ").kind == Kind::Status);
  TEST_ASSERT_TRUE(core::parse_command("help\r").kind == Kind::Help);
  TEST_ASSERT_TRUE(core::parse_command("pair now").kind == Kind::Invalid);
}

TEST_CASE("an empty line is Invalid with nothing to print", "[commands]") {
  auto command = core::parse_command("   ");
  TEST_ASSERT_TRUE(command.kind == Kind::Invalid);
  TEST_ASSERT_EQUAL_STRING("", command.error.c_str());
}

TEST_CASE("an unknown command says so", "[commands]") {
  auto command = core::parse_command("frobnicate now");
  TEST_ASSERT_TRUE(command.kind == Kind::Invalid);
  TEST_ASSERT_EQUAL_STRING("unknown command: frobnicate — type help", command.error.c_str());
}

TEST_CASE("a very long line is Invalid", "[commands]") {
  auto command = core::parse_command("wifi " + std::string(300, 'x'));
  TEST_ASSERT_TRUE(command.kind == Kind::Invalid);
  TEST_ASSERT_TRUE(core::parse_command(std::string(300, 'x')).kind == Kind::Invalid);
  TEST_ASSERT_TRUE(core::parse_command(R"(wifi "unterminated)").kind == Kind::Invalid);
}
