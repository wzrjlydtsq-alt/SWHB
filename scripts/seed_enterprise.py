"""
星河智绘组织种子数据初始化脚本

功能：
  1. 创建默认组织：星河智绘默认工作室
  2. 创建管理员：郭瑞凡 (admin)
  3. 导入 5 个制作组 + 全部人员
  4. 所有用户默认密码：qazwsx123

用法：
  python seed_enterprise.py

前置条件：
  - 云端 API 服务运行中 (http://47.109.138.168/api/v1)
  - 后端已实现 /auth/enterprise/check 和 /auth/enterprise-login 接口
  - 后端已实现企业管理相关 API
"""

import urllib.request
import urllib.error
import json
import sys

# ═══════════════════════════════════
#  配置
# ═══════════════════════════════════

BASE_URL = "http://47.109.138.168/api/v1"
ENTERPRISE_NAME = "星河智绘默认工作室"
DEFAULT_PASSWORD = "qazwsx123"

# 管理员
ADMIN = {
    "username": "郭瑞凡",
    "password": DEFAULT_PASSWORD,
    "display_name": "郭瑞凡",
    "role": "admin",
    "department": "技术部"
}

# 制作组人员
GROUPS = {
    "制作一组": {
        "director": ["周奕名"],
        "members": [
            "张宇轩", "罗泳", "杨振超", "徐员茂", "廖强",
            "雷海川", "曹程", "贺海峰", "吴勇", "袁益伟",
            "陈浩然", "王婷", "陈节", "程润", "谯皓月"
        ]
    },
    "制作二组": {
        "director": ["李晨露"],
        "members": [
            "陈皞", "张佳", "唐星弘", "吴姗姗", "罗建琳",
            "唐鹏", "潘越", "罗泽琪", "张杰银"
        ]
    },
    "制作三组": {
        "director": ["何梓菁"],
        "members": [
            "李如玲", "刘虹琼", "朱世铮", "陈冠澎",
            "郭俊平", "陈旭", "李雅娟", "尹媛媛"
        ]
    },
    "制作四组": {
        "director": ["杨虎"],
        "members": ["马胜涛", "字豪"]
    },
    "制作五组": {
        "director": ["郭珊池"],
        "members": ["张志飞", "刘乡悦", "邓宇阳", "罗俊杰"]
    }
}

# ═══════════════════════════════════
#  工具函数
# ═══════════════════════════════════

def api_request(method, path, data=None, token=None):
    """统一 API 请求"""
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req) as response:
            text = response.read().decode("utf-8")
            return json.loads(text) if text.strip() else {}
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        print(f"  ⚠ API 错误 [{e.code}] {path}: {error_body[:200]}")
        return None


def login_admin():
    """使用系统管理员登录获取 token"""
    # 尝试用平台管理员登录
    result = api_request("POST", "/auth/login", {
        "target": "admin",
        "type": "phone",
        "code": "123456"
    })
    if result and result.get("data", {}).get("access_token"):
        return result["data"]["access_token"]

    # 直接用 admin 账号
    result = api_request("POST", "/auth/login", {
        "target": "13900000001",
        "type": "phone",
        "code": "123456"
    })
    if result and result.get("data", {}).get("access_token"):
        return result["data"]["access_token"]

    return None


# ═══════════════════════════════════
#  主流程
# ═══════════════════════════════════

def seed():
    print(f"{'='*60}")
    print(f"  企业种子数据初始化")
    print(f"  企业名称: {ENTERPRISE_NAME}")
    print(f"  后端地址: {BASE_URL}")
    print(f"{'='*60}\n")

    # 1. 登录管理员
    print("[1/4] 登录系统管理员...")
    token = login_admin()
    if not token:
        print("  ✗ 登录失败，请确认后端服务已运行且管理员账号可用")
        print("  提示：如果后端尚未实现企业认证接口，请先手动创建")
        sys.exit(1)
    print("  ✓ 管理员已登录\n")

    # 2. 创建企业
    print(f"[2/4] 创建企业: {ENTERPRISE_NAME}")
    ent_result = api_request("POST", "/enterprises", {
        "name": ENTERPRISE_NAME,
        "display_name": ENTERPRISE_NAME
    }, token)
    if ent_result and ent_result.get("data"):
        ent_id = ent_result["data"].get("id")
        print(f"  ✓ 企业已创建 (ID: {ent_id})\n")
    else:
        # 可能已存在，尝试查询
        check = api_request("GET", f"/auth/enterprise/check?name={urllib.parse.quote(ENTERPRISE_NAME)}")
        if check and check.get("data", {}).get("exists"):
            ent_id = check["data"]["enterprise_id"]
            print(f"  ℹ 企业已存在 (ID: {ent_id})\n")
        else:
            print("  ⚠ 创建企业失败，跳过企业绑定，继续创建用户\n")
            ent_id = None

    # 3. 创建管理员用户
    print(f"[3/4] 创建管理员: {ADMIN['username']}")
    admin_result = api_request("POST", "/users", {
        "username": ADMIN["username"],
        "password": ADMIN["password"],
        "display_name": ADMIN["display_name"],
        "role": ADMIN["role"],
        "department": ADMIN["department"],
        "enterprise_id": ent_id
    }, token)
    if admin_result:
        print(f"  ✓ 管理员 {ADMIN['username']} 已创建\n")
    else:
        print(f"  ℹ 管理员 {ADMIN['username']} 可能已存在\n")

    # 4. 创建制作组 + 成员
    print("[4/4] 创建制作组和成员...")
    total_created = 0
    total_skipped = 0

    for dept_name, group_info in GROUPS.items():
        print(f"\n  ── {dept_name} ──")

        # 创建部门
        dept_result = api_request("POST", "/departments", {"name": dept_name}, token)
        if dept_result:
            print(f"    ✓ 部门已创建")
        else:
            print(f"    ℹ 部门已存在")

        # 合并组长和成员
        all_users = []
        for d in group_info.get("director", []):
            all_users.append((d, "director"))
        for m in group_info.get("members", []):
            all_users.append((m, "member"))

        for name, role in all_users:
            user_data = {
                "username": name,
                "password": DEFAULT_PASSWORD,
                "display_name": name,
                "role": role,
                "department": dept_name,
                "email": ""
            }
            if ent_id:
                user_data["enterprise_id"] = ent_id

            result = api_request("POST", "/users", user_data, token)
            if result:
                role_label = "🔹组长" if role == "director" else "  成员"
                print(f"    ✓ {role_label} {name}")
                total_created += 1
            else:
                total_skipped += 1

    # 汇总
    print(f"\n{'='*60}")
    print(f"  初始化完成！")
    print(f"  企业: {ENTERPRISE_NAME}")
    if ent_id:
        print(f"  企业 ID: {ent_id}")
    print(f"  管理员: {ADMIN['username']}")
    print(f"  新建用户: {total_created}")
    print(f"  已存在跳过: {total_skipped}")
    print(f"  默认密码: {DEFAULT_PASSWORD}")
    print(f"{'='*60}")


if __name__ == "__main__":
    import urllib.parse
    seed()
