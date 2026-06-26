/**
 * AI 副驾 — 工具定义（OpenAI 兼容 function calling 格式）
 * Gemini / GPT / Doubao 通用
 */

export const CANVAS_TOOLS = [
  // ══ 查询类 ══
  {
    type: 'function',
    function: {
      name: 'list_nodes',
      description: '列出画布上所有节点的概要信息（类型、提示词、模型、状态）',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_node',
      description: '获取指定节点的详细信息（设置、位置、输出结果数量等）',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: '节点 ID' }
        },
        required: ['nodeId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_model_configs',
      description: '查看用户已配置的所有 AI 模型及可用状态（是否有API Key）',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_history',
      description: '查看最近的生成历史记录，支持按状态和类型筛选',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['generating', 'completed', 'failed'],
            description: '按状态筛选'
          },
          type: {
            type: 'string',
            enum: ['image', 'video'],
            description: '按生成类型筛选'
          },
          limit: {
            type: 'number',
            description: '返回条数限制，默认20'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_assets',
      description: '查看资产库中指定分类的资产列表（人物/场景/素材/音频）',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['characters', 'scenes', 'materials', 'audio'],
            description: '资产分类：characters=人物, scenes=场景, materials=素材, audio=音频'
          }
        },
        required: ['category']
      }
    }
  },

  // ══ 写入类 ══
  {
    type: 'function',
    function: {
      name: 'create_node',
      description:
        '在画布上创建一个新节点。可选类型：gen-image(图片生成)、gen-video(视频生成)、director-node(导演分镜)、director-stage(3D导演台)、agent-node(智能代理)',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['gen-image', 'gen-video', 'director-node', 'director-stage', 'agent-node'],
            description: '节点类型'
          },
          prompt: {
            type: 'string',
            description: '提示词（图片节点用prompt，视频节点也传这个字段，会自动映射为videoPrompt）'
          },
          model: {
            type: 'string',
            description: '模型 ID（从 get_model_configs 获取的id字段）'
          },
          ratio: {
            type: 'string',
            description: '画面比例，如 16:9, 9:16, 1:1, 4:3, 3:4'
          },
          resolution: {
            type: 'string',
            description: '分辨率，如 Auto, 1K, 2K, 4K, 1080P, 720P'
          },
          duration: {
            type: 'string',
            description: '视频时长（仅视频节点），如 5s, 8s, 10s, 15s'
          }
        },
        required: ['type']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_node',
      description: '更新指定节点的设置（提示词、模型、比例、分辨率、时长、批量数等）',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: '要修改的节点 ID' },
          prompt: { type: 'string', description: '新的提示词（图片节点）' },
          videoPrompt: { type: 'string', description: '新的提示词（视频节点）' },
          model: { type: 'string', description: '新的模型 ID' },
          ratio: { type: 'string', description: '新的画面比例' },
          resolution: { type: 'string', description: '新的分辨率' },
          duration: { type: 'string', description: '新的视频时长' },
          batchSize: { type: 'number', description: '批量生成数量 (1-4)' }
        },
        required: ['nodeId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_node',
      description: '删除画布上指定的节点',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: '要删除的节点 ID' }
        },
        required: ['nodeId']
      }
    }
  },

  // ══ 系统操作 ══
  {
    type: 'function',
    function: {
      name: 'set_theme',
      description:
        '切换应用主题色。支持颜色名称（蓝色/紫色/红色/绿色/粉色/橙色/深空/晴空/薄荷/玫瑰/琥珀）或 hex 色值如 #2563eb',
      parameters: {
        type: 'object',
        properties: {
          color: { type: 'string', description: '颜色名称或 hex 色值' }
        },
        required: ['color']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'toggle_panel',
      description: '打开或关闭应用面板（设置/历史/资产库/项目列表）',
      parameters: {
        type: 'object',
        properties: {
          panel: {
            type: 'string',
            enum: ['settings', 'history', 'assets', 'projects'],
            description: '面板名称'
          },
          open: { type: 'boolean', description: '打开(true)或关闭(false)' }
        },
        required: ['panel', 'open']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'clear_history',
      description: '清理生成历史记录。可按状态筛选清理，不传status则全部清空',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['generating', 'completed', 'failed'],
            description: '只清理指定状态的记录'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'arrange_nodes',
      description: '自动将画布上所有节点排列为整齐的网格布局',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_group',
      description: '将指定的多个节点编成一个组',
      parameters: {
        type: 'object',
        properties: {
          nodeIds: {
            type: 'array',
            items: { type: 'string' },
            description: '要编组的节点 ID 数组'
          },
          name: { type: 'string', description: '组名' }
        },
        required: ['nodeIds', 'name']
      }
    }
  },

  // ══ 生成类 ══
  {
    type: 'function',
    function: {
      name: 'generate',
      description: '触发指定节点开始生成（节点必须已有提示词和模型）',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: '要执行生成的节点 ID' }
        },
        required: ['nodeId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_and_generate',
      description:
        '一步到位：创建节点 + 填入提示词和参数 + 立即触发生成。适合用户说"帮我生成一张xxx"这种简短指令',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['gen-image', 'gen-video'],
            description: '节点类型：gen-image 或 gen-video'
          },
          prompt: {
            type: 'string',
            description: '生成提示词（建议使用高质量的英文提示词）'
          },
          model: {
            type: 'string',
            description: '模型 ID（如不确定可不传，会使用默认模型）'
          },
          ratio: {
            type: 'string',
            description: '画面比例，如 16:9, 9:16, 1:1'
          },
          resolution: {
            type: 'string',
            description: '分辨率'
          },
          duration: {
            type: 'string',
            description: '视频时长（仅视频节点）'
          }
        },
        required: ['type', 'prompt']
      }
    }
  },

  // ══ 第四阶段：资产库写入 ══
  {
    type: 'function',
    function: {
      name: 'add_to_asset_library',
      description: '将图片或视频 URL 添加到资产库中指定分类',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['characters', 'scenes', 'materials', 'audio'],
            description: '目标分类'
          },
          url: { type: 'string', description: '资产的 URL 地址' },
          name: { type: 'string', description: '自定义资产名称（可选）' }
        },
        required: ['category', 'url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_asset_folder',
      description: '在资产库指定分类中新建文件夹',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['characters', 'scenes', 'materials', 'audio'],
            description: '目标分类'
          },
          folderName: { type: 'string', description: '文件夹名称' }
        },
        required: ['category', 'folderName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'save_history_to_assets',
      description: '将历史记录中的生成结果存入资产库',
      parameters: {
        type: 'object',
        properties: {
          historyId: { type: 'string', description: '历史记录 ID' },
          category: {
            type: 'string',
            enum: ['characters', 'scenes', 'materials', 'audio'],
            description: '存入的分类（不传则自动判断：视频→素材，图片→场景）'
          }
        },
        required: ['historyId']
      }
    }
  },

  // ══ 第四阶段：导演分镜 ══
  {
    type: 'function',
    function: {
      name: 'setup_director',
      description: '配置导演节点的基础参数（创意想法、比例、时长、风格、调性）',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: '导演节点 ID' },
          idea: { type: 'string', description: '视频创意/故事想法' },
          ratio: {
            type: 'string',
            enum: ['16:9', '9:16', '4:3', '3:4', '1:1'],
            description: '画面比例'
          },
          duration: {
            type: 'string',
            enum: ['30秒', '45秒', '1分钟', '2分钟'],
            description: '目标总时长'
          },
          style: {
            type: 'string',
            enum: ['写实风', '动漫风', '3D动画', '像素风', '水墨风'],
            description: '画面风格'
          },
          direction: {
            type: 'string',
            enum: ['搞笑', '严肃', '温馨', '悬疑'],
            description: '叙事调性'
          }
        },
        required: ['nodeId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_director_script',
      description: '读取导演节点的剧本和分镜信息',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: '导演节点 ID' }
        },
        required: ['nodeId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_director_shot',
      description: '修改导演节点中某个分镜的提示词、中文描述或时长',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: '导演节点 ID' },
          shotId: { type: 'number', description: '分镜序号（从1开始）' },
          prompt: { type: 'string', description: '新的英文AI绘图提示词' },
          promptCn: { type: 'string', description: '新的中文镜头描述' },
          duration: { type: 'number', description: '新的时长（秒）' }
        },
        required: ['nodeId', 'shotId']
      }
    }
  },

  // ══ 第四阶段：批量操作 & 辅助 ══
  {
    type: 'function',
    function: {
      name: 'batch_update_nodes',
      description: '批量更新多个节点的设置。例如：一次性把所有节点的模型都换掉',
      parameters: {
        type: 'object',
        properties: {
          updates: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                nodeId: { type: 'string', description: '节点 ID' },
                prompt: { type: 'string' },
                videoPrompt: { type: 'string' },
                model: { type: 'string' },
                ratio: { type: 'string' },
                resolution: { type: 'string' },
                duration: { type: 'string' },
                batchSize: { type: 'number' }
              },
              required: ['nodeId']
            },
            description: '更新数组，每项包含 nodeId 和要更新的字段'
          }
        },
        required: ['updates']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'select_node',
      description: '选中画布上指定的节点（高亮并聚焦）',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: '要选中的节点 ID' }
        },
        required: ['nodeId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'duplicate_node',
      description: '复制一个节点（保留设置，清空生成结果）',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: '要复制的节点 ID' }
        },
        required: ['nodeId']
      }
    }
  },

  // ══ 第五波：进阶操作 ══
  {
    type: 'function',
    function: {
      name: 'move_node',
      description: '移动节点到画布上的指定坐标位置',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: '节点 ID' },
          x: { type: 'number', description: 'X 坐标' },
          y: { type: 'number', description: 'Y 坐标' }
        },
        required: ['nodeId', 'x', 'y']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'resize_node',
      description: '调整节点的宽高大小',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: '节点 ID' },
          width: { type: 'number', description: '新宽度（像素）' },
          height: { type: 'number', description: '新高度（像素）' }
        },
        required: ['nodeId', 'width', 'height']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'remove_group',
      description: '移除一个节点分组（节点本身保留，只解散分组）',
      parameters: {
        type: 'object',
        properties: {
          groupId: { type: 'string', description: '分组 ID' }
        },
        required: ['groupId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_nodes',
      description: '按关键词搜索画布上的节点（匹配提示词、类型、ID）',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '搜索关键词' }
        },
        required: ['keyword']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_canvas_stats',
      description: '获取画布的全面统计信息（节点类型分布、生成状态、连接数、分组数、历史完成率等）',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'retry_failed_tasks',
      description: '重试历史记录中失败的任务（自动创建新节点并重新生成）',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: '最多重试几个失败任务，默认5' },
          confirm: { type: 'boolean', description: 'must be true to resubmit failed tasks' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'clear_canvas',
      description:
        '清空整个画布（删除所有节点）。这是高危操作，只有用户明确要求“清空画布/删除全部节点”时才允许调用，并且必须传 confirm="CLEAR_CANVAS"。',
      parameters: {
        type: 'object',
        properties: {
          confirm: {
            type: 'string',
            enum: ['CLEAR_CANVAS'],
            description: '用户明确要求清空画布后才可传入 CLEAR_CANVAS'
          }
        },
        required: ['confirm']
      }
    }
  },

  // ══ Wave 1：本地文件系统 ══
  {
    type: 'function',
    function: {
      name: 'read_local_file',
      description: '读取用户电脑上的本地文本文件（支持 txt/md/json/csv/srt）。用户会提供文件路径。',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: '文件的绝对路径，如 D:\\文档\\剧本.txt' }
        },
        required: ['filePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_local_directory',
      description: '列出用户电脑上某个文件夹里的文件。可按类型过滤：images/videos/text',
      parameters: {
        type: 'object',
        properties: {
          dirPath: { type: 'string', description: '文件夹的绝对路径' },
          filter: {
            type: 'string',
            enum: ['images', 'videos', 'text'],
            description: '按文件类型过滤，不填则返回全部'
          }
        },
        required: ['dirPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'load_local_images_to_node',
      description: '将用户电脑上某个文件夹中的所有图片载入到指定节点作为参考图/输入图',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: '目标节点 ID' },
          dirPath: { type: 'string', description: '包含图片的文件夹路径' }
        },
        required: ['nodeId', 'dirPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'pick_file_dialog',
      description: '弹出系统文件选择对话框，让用户手动选择一个文件',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'pick_folder_dialog',
      description: '弹出系统文件夹选择对话框，让用户手动选择一个文件夹',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_computer_access_status',
      description: '查看当前工作台允许 AI 访问电脑的范围，包括全局电脑访问或已授权目录',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_local_text_file',
      description: '在用户已授权的本机路径写入文本文件；可用于创建或修改代码、文档、脚本',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: '要写入的完整本机文件路径' },
          content: { type: 'string', description: '要写入的文本内容' },
          append: { type: 'boolean', description: '是否追加到文件末尾，默认 false 覆盖写入' }
        },
        required: ['filePath', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'copy_local_path',
      description: '复制用户已授权范围内的本机文件或文件夹',
      parameters: {
        type: 'object',
        properties: {
          sourcePath: { type: 'string', description: '源文件或源文件夹完整路径' },
          targetPath: { type: 'string', description: '目标完整路径' },
          overwrite: { type: 'boolean', description: '目标存在时是否覆盖，默认 false' }
        },
        required: ['sourcePath', 'targetPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'move_local_path',
      description: '移动或重命名用户已授权范围内的本机文件或文件夹',
      parameters: {
        type: 'object',
        properties: {
          sourcePath: { type: 'string', description: '源文件或源文件夹完整路径' },
          targetPath: { type: 'string', description: '目标完整路径' },
          overwrite: { type: 'boolean', description: '目标存在时是否覆盖，默认 false' }
        },
        required: ['sourcePath', 'targetPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_local_path',
      description: '删除用户已授权范围内的本机文件或文件夹。删除文件夹必须 recursive=true',
      parameters: {
        type: 'object',
        properties: {
          targetPath: { type: 'string', description: '要删除的完整路径' },
          recursive: { type: 'boolean', description: '删除文件夹时必须为 true' }
        },
        required: ['targetPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'make_local_directory',
      description: '在用户已授权范围内创建本机文件夹',
      parameters: {
        type: 'object',
        properties: {
          dirPath: { type: 'string', description: '要创建的完整文件夹路径' }
        },
        required: ['dirPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_local_path',
      description: '用系统默认应用打开用户已授权范围内的本机文件或文件夹',
      parameters: {
        type: 'object',
        properties: {
          targetPath: { type: 'string', description: '要打开的完整路径' }
        },
        required: ['targetPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_local_command',
      description:
        '在用户已授权范围内执行本机命令。只有开启全局电脑访问，或 cwd 是已授权目录时才允许执行',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的命令' },
          cwd: { type: 'string', description: '命令工作目录' },
          timeoutMs: { type: 'number', description: '超时时间，默认 30000，最大 120000' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'start_terminal_session',
      description: '启动一个持续终端会话，适合需要观察长任务、继续输入命令、停止进程的场景',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '启动后立即执行的命令，可为空' },
          cwd: { type: 'string', description: '终端工作目录' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_workspace_context',
      description:
        '获取当前类 Codex 工作台上下文：当前工作台文件、授权目录、审批模式、目录索引、最近素材、任务、浏览器证据和审查记录摘要',
      parameters: {
        type: 'object',
        properties: {
          includeIndex: { type: 'boolean', description: '是否包含最近扫描的目录索引，默认 true' },
          includeMaterials: { type: 'boolean', description: '是否包含最近素材/产物，默认 true' },
          includeTasks: { type: 'boolean', description: '是否包含工作台任务，默认 true' },
          includeBrowser: { type: 'boolean', description: '是否包含浏览器证据，默认 true' },
          includeReviews: { type: 'boolean', description: '是否包含审查记录，默认 true' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_workspace_documents',
      description:
        '在当前类 Codex 工作台的项目素材/附件里搜索 PDF、Excel、Word 或文本索引，适合大文档、超长表格和被截断附件的定向查找',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '要搜索的关键词、短语或编号' },
          materialId: { type: 'string', description: '可选，限定某个素材 ID' },
          fileName: { type: 'string', description: '可选，按素材文件名过滤' },
          limit: { type: 'number', description: '返回条数，默认 8，最大 20' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_browser_url',
      description: '用系统浏览器打开 URL，并把它记录为当前工作台的浏览器目标',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '要打开的 URL，支持 http、https、file、localhost' },
          note: { type: 'string', description: '打开这个页面的目的或备注' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_browser_review_task',
      description: '创建一个浏览器检查任务，用于记录需要验证的页面、布局、交互或回归测试',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '要检查的页面 URL，可为空' },
          note: { type: 'string', description: '检查目标，例如移动端布局、按钮溢出、登录流程等' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'inspect_browser_url',
      description:
        '检查一个 http/https URL 是否可访问，返回状态码、最终 URL、内容类型、页面标题和短摘要，并记录到工作台浏览器目标',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '要检查的 URL，支持 http、https、localhost' },
          note: { type: 'string', description: '检查这个页面的目的或备注' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'capture_browser_url_screenshot',
      description:
        '加载一个 URL 并保存页面截图，返回本地截图路径，用于浏览器验收、UI 回归和页面证据留存',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '要截图的 URL，支持 http、https、file、localhost' },
          note: { type: 'string', description: '截图目的或备注' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'inspect_browser_dom',
      description:
        '加载一个页面并提取标题、正文摘要和可交互元素列表，返回 selector、文本、href 和位置，用于页面理解和后续受控点击',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '要检查 DOM 的 URL，支持 http、https、file、localhost'
          },
          note: { type: 'string', description: '检查目的或备注' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'click_browser_element',
      description:
        '在隐藏浏览器中打开页面并按 selector 或可见文本点击一个元素，返回最终 URL、标题和截图证据。只用于验收和导航，不用于付款、删除、提交敏感操作',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '要打开并点击的 URL，支持 http、https、file、localhost'
          },
          selector: {
            type: 'string',
            description: '优先使用的 CSS selector，通常来自 inspect_browser_dom 的返回结果'
          },
          text: { type: 'string', description: '没有 selector 时可使用的按钮/链接可见文本' },
          note: { type: 'string', description: '点击目的或备注' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'capture_browser_viewport_matrix',
      description:
        '对同一个 URL 生成桌面、平板、手机等多个视口截图，用于检查响应式布局、首屏遮挡和移动端问题',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '要截图的 URL，支持 http、https、file、localhost' },
          viewports: {
            type: 'array',
            description: '可选视口列表；不传时默认 desktop/tablet/mobile',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: '视口名称，如 desktop/mobile' },
                width: { type: 'number', description: '视口宽度' },
                height: { type: 'number', description: '视口高度' }
              },
              required: ['width', 'height']
            }
          },
          note: { type: 'string', description: '截图目的或备注' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'annotate_browser_screenshot',
      description:
        '对页面中的指定 selector 或文本生成带高亮框和编号的截图，用于指出 UI 问题位置、按钮位置或验收关注点',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '要标注截图的 URL，支持 http、https、file、localhost'
          },
          selectors: {
            type: 'array',
            description: '要高亮的 CSS selector 列表',
            items: { type: 'string' }
          },
          texts: {
            type: 'array',
            description: '要按可见文本匹配并高亮的按钮/链接/输入框文本',
            items: { type: 'string' }
          },
          width: { type: 'number', description: '可选截图视口宽度' },
          height: { type: 'number', description: '可选截图视口高度' },
          note: { type: 'string', description: '标注目的或备注' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'inspect_browser_console',
      description:
        '加载页面并收集 console warn/error、页面加载失败、渲染崩溃和页面错误摘要，用于排查前端问题',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '要诊断的 URL，支持 http、https、localhost、file' },
          limit: { type: 'number', description: '最多保留的 console 消息数，默认 80' },
          width: { type: 'number', description: '页面宽度，默认 1280' },
          height: { type: 'number', description: '页面高度，默认 900' },
          note: { type: 'string', description: '诊断目的或备注' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fill_browser_form',
      description:
        '在隐藏浏览器中打开页面并按 selector/label 填写表单，默认只填写不提交；明确 submit=true 时才点击提交按钮，并返回截图证据',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '要填写表单的 URL，支持 http、https、file、localhost'
          },
          fields: {
            type: 'array',
            description: '要填写的字段列表',
            items: {
              type: 'object',
              properties: {
                selector: { type: 'string', description: '字段 CSS selector，优先使用' },
                label: {
                  type: 'string',
                  description: '没有 selector 时按 label/placeholder/name 匹配'
                },
                name: { type: 'string', description: '字段 name 或辅助匹配名' },
                placeholder: { type: 'string', description: '字段 placeholder 或辅助匹配名' },
                value: {
                  oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
                  description: '要写入的值'
                }
              },
              required: ['value']
            }
          },
          submit: { type: 'boolean', description: '是否提交；默认 false' },
          submitSelector: { type: 'string', description: '提交按钮 selector' },
          submitText: { type: 'string', description: '提交按钮可见文本' },
          note: { type: 'string', description: '填写目的或备注' }
        },
        required: ['url', 'fields']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'start_browser_session',
      description:
        '启动一个可持续复用的隐藏浏览器会话，用于多步页面操作、登录态复用、连续点击/填表/截图',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '要打开的 URL，支持 http、https、file、localhost' },
          sessionId: {
            type: 'string',
            description: '可选会话 ID；相同 ID 会复用该工作台浏览器登录态'
          },
          width: { type: 'number', description: '视口宽度，默认 1280' },
          height: { type: 'number', description: '视口高度，默认 900' },
          persistProfile: {
            type: 'boolean',
            description: '是否保留 cookie/localStorage 供后续会话复用，默认 true'
          },
          note: { type: 'string', description: '会话用途或备注' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'import_browser_cookies',
      description:
        '把用户授权提供的浏览器 cookies JSON 导入到工作台持久浏览器会话，用于复用外部浏览器登录态。适合从 Chrome/Edge 导出 cookies 后迁移到工作台会话。',
      parameters: {
        type: 'object',
        properties: {
          sessionId: {
            type: 'string',
            description: '目标工作台浏览器会话 ID；为空时使用默认会话 ID'
          },
          cookies: {
            description: 'cookies JSON 数组，或包含 cookies/data 数组的对象',
            oneOf: [{ type: 'array', items: { type: 'object' } }, { type: 'object' }]
          },
          note: { type: 'string', description: '导入目的或备注' }
        },
        required: ['cookies']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_external_browser_profiles',
      description:
        '列出本机常见 Chrome/Edge/Brave/Firefox profile 目录候选，用于指导用户选择真实浏览器登录态来源。只发现路径，不解密或读取 cookie 内容。',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'import_external_browser_profile_cookies',
      description:
        '用户授权后，从已发现的 Chrome/Edge/Brave Chromium Profile 直接读取并解密 cookies，导入当前工作台持久浏览器会话。仅在用户明确要求复用真实浏览器登录态时使用。',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: '工作台浏览器会话 ID，不填用当前工作台默认' },
          profilePath: {
            type: 'string',
            description: 'list_external_browser_profiles 返回的 profilePath'
          },
          domain: { type: 'string', description: '可选，按域名过滤，如 openai.com' },
          limit: { type: 'number', description: '最多导入 cookie 数，默认 1200' },
          note: { type: 'string', description: '导入说明' }
        },
        required: ['profilePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'inspect_browser_session_dom',
      description: '读取已启动浏览器会话当前页面的标题、正文摘要和可交互元素列表',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'start_browser_session 返回的会话 ID' },
          limit: { type: 'number', description: '最多返回多少个可交互元素，默认 80' },
          note: { type: 'string', description: '检查目的或备注' }
        },
        required: ['sessionId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'inspect_browser_session_console',
      description:
        '读取已启动浏览器会话的控制台警告/错误、加载失败和渲染崩溃摘要，不重新加载页面，保留登录态和当前状态',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: '浏览器会话 ID' },
          limit: { type: 'number', description: '最多返回多少条控制台/加载记录，默认 80' },
          note: { type: 'string', description: '诊断目的或备注' }
        },
        required: ['sessionId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'click_browser_session_element',
      description: '在已启动浏览器会话里按 selector 或文本点击元素，保留页面状态并返回截图证据',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: '浏览器会话 ID' },
          selector: { type: 'string', description: 'CSS selector，优先使用' },
          text: { type: 'string', description: '没有 selector 时按可见文本匹配' },
          waitMs: { type: 'number', description: '点击后等待毫秒数，默认 900' },
          note: { type: 'string', description: '点击目的或备注' }
        },
        required: ['sessionId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fill_browser_session_form',
      description:
        '在已启动浏览器会话里填写表单，默认不提交；明确 submit=true 才提交，适合多步登录/设置/搜索流程',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: '浏览器会话 ID' },
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                selector: { type: 'string', description: '字段 CSS selector' },
                label: { type: 'string', description: '字段 label/placeholder/name 匹配文本' },
                name: { type: 'string', description: '字段 name 或辅助匹配名' },
                placeholder: { type: 'string', description: '字段 placeholder 或辅助匹配名' },
                value: {
                  oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
                  description: '要填写的值'
                }
              },
              required: ['value']
            }
          },
          submit: { type: 'boolean', description: '是否提交；默认 false' },
          submitSelector: { type: 'string', description: '提交按钮 selector' },
          submitText: { type: 'string', description: '提交按钮可见文本' },
          note: { type: 'string', description: '填写目的或备注' }
        },
        required: ['sessionId', 'fields']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'capture_browser_session_screenshot',
      description: '截取已启动浏览器会话当前页面，保留会话并返回本地截图路径',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: '浏览器会话 ID' },
          note: { type: 'string', description: '截图目的或备注' }
        },
        required: ['sessionId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'close_browser_session',
      description: '关闭已启动的隐藏浏览器会话，释放资源',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: '浏览器会话 ID' }
        },
        required: ['sessionId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_workspace_git_summary',
      description: '获取当前授权工作目录的 git status --short 和 git diff --stat，用于审查变更摘要',
      parameters: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Git 工作目录；为空时使用当前工作台第一个授权目录' }
        }
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'post_github_pr_comment',
      description:
        '通过用户本机已登录的 gh CLI 把审查意见写回 GitHub PR。传 path 和 line 时创建行内评论；不传 path/line 时创建普通 PR 评论。需要当前工作目录已授权且 gh 已登录。',
      parameters: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Git 工作目录；为空时使用当前工作台第一个授权目录' },
          prNumber: { type: 'string', description: 'PR 编号；行内评论必填' },
          body: { type: 'string', description: '评论正文' },
          path: { type: 'string', description: '要评论的文件路径；行内评论时必填' },
          line: { type: 'number', description: '要评论的新文件行号；行内评论时必填' },
          side: {
            type: 'string',
            enum: ['RIGHT', 'LEFT'],
            description: 'RIGHT 评论新文件，LEFT 评论旧文件；默认 RIGHT'
          }
        },
        required: ['body']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'submit_github_pr_review',
      description:
        '通过用户本机已登录的 gh CLI 一次性提交 GitHub PR Review，可包含多条行内评论，并可选择 COMMENT / REQUEST_CHANGES / APPROVE。',
      parameters: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Git 工作目录；为空时使用当前工作台第一个授权目录' },
          prNumber: { type: 'string', description: 'PR 编号' },
          body: { type: 'string', description: 'Review 总评正文' },
          event: {
            type: 'string',
            enum: ['COMMENT', 'REQUEST_CHANGES', 'APPROVE'],
            description: 'Review 事件，默认 COMMENT'
          },
          commitId: {
            type: 'string',
            description: '可选 PR head commit id；不填会用 gh pr view 自动读取'
          },
          comments: {
            type: 'array',
            description: '行内评论列表，最多 80 条',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string', description: '文件路径' },
                line: { type: 'number', description: '新文件行号' },
                side: {
                  type: 'string',
                  enum: ['RIGHT', 'LEFT'],
                  description: 'RIGHT 新文件，LEFT 旧文件'
                },
                body: { type: 'string', description: '评论正文' }
              },
              required: ['path', 'line', 'body']
            }
          }
        },
        required: ['prNumber']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'post_gitlab_mr_comment',
      description:
        '通过用户本机已登录的 glab CLI 把审查意见写回 GitLab Merge Request。传 path/line 时尝试创建行内 note；不传时创建普通 MR note。',
      parameters: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Git 工作目录；为空时使用当前工作台第一个授权目录' },
          mrNumber: { type: 'string', description: 'GitLab MR 编号或当前分支可识别的 MR' },
          body: { type: 'string', description: '评论正文' },
          path: { type: 'string', description: '可选，行内评论文件路径' },
          line: { type: 'number', description: '可选，行内评论行号' }
        },
        required: ['mrNumber', 'body']
      }
    }
  },

  // ══ Wave 2：智能创作辅助 ══
  {
    type: 'function',
    function: {
      name: 'enhance_prompt',
      description: '将用户的简短中文描述增强为专业、详细的生成式AI提示词',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '用户的原始描述' },
          style: {
            type: 'string',
            description: '目标风格：cinematic/anime/oil-painting/watercolor/pixel'
          },
          language: { type: 'string', enum: ['english', 'chinese'], description: '输出语言' }
        },
        required: ['prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'translate_prompt',
      description: '将提示词在中文和英文之间互译',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '要翻译的提示词' },
          targetLanguage: { type: 'string', enum: ['english', 'chinese'], description: '目标语言' }
        },
        required: ['prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'suggest_prompt_variants',
      description: '基于一个提示词生成多个不同风格的变体版本，用于A/B测试或风格探索',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '基础提示词' },
          count: { type: 'number', description: '生成几个变体，默认5' },
          styles: {
            type: 'array',
            items: { type: 'string' },
            description: '指定风格列表，如 ["写实","油画","动漫"]'
          }
        },
        required: ['prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyze_failed_reason',
      description: '分析一个失败的生成任务的原因，给出修复建议',
      parameters: {
        type: 'object',
        properties: {
          historyId: { type: 'string', description: '历史记录ID，不填则分析最近一次失败' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'recommend_model',
      description: '根据用户的创作需求推荐最合适的AI模型和参数配置',
      parameters: {
        type: 'object',
        properties: {
          requirement: { type: 'string', description: '用户的需求描述，如"我想画水墨风格"' }
        },
        required: ['requirement']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'batch_create_and_generate',
      description: '批量创建多个节点并全部触发生成。传入提示词数组，每个提示词创建一个节点。',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['gen-image', 'gen-video'], description: '节点类型' },
          prompts: {
            type: 'array',
            items: { type: 'string' },
            description: '提示词数组，每个元素对应一个节点'
          },
          model: { type: 'string', description: '模型ID' },
          ratio: { type: 'string', description: '比例' },
          resolution: { type: 'string', description: '分辨率' },
          duration: { type: 'string', description: '视频时长' }
        },
        required: ['prompts']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'clone_with_variants',
      description: '复制一个节点多次，每次在原提示词后追加不同的变体描述',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: '源节点ID' },
          variants: {
            type: 'array',
            items: { type: 'string' },
            description: '变体后缀数组，如 ["白天","黄昏","夜晚"]'
          }
        },
        required: ['nodeId', 'variants']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'export_canvas_summary',
      description: '将画布上所有节点的信息导出为结构化的文本摘要',
      parameters: { type: 'object', properties: {} }
    }
  },

  // ══ Wave 3：预设系统 ══
  {
    type: 'function',
    function: {
      name: 'save_preset',
      description: '将指定节点的当前配置（模型/比例/分辨率等）保存为可复用的预设',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '预设名称，如"赛博朋克"' },
          nodeId: { type: 'string', description: '要提取配置的节点ID，不填则保存空预设' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_presets',
      description: '列出所有已保存的配置预设',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'apply_preset',
      description: '将已保存的预设配置应用到指定节点',
      parameters: {
        type: 'object',
        properties: {
          presetId: { type: 'string', description: '预设ID或名称' },
          nodeId: { type: 'string', description: '目标节点ID' }
        },
        required: ['presetId', 'nodeId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_preset',
      description: '删除一个已保存的预设',
      parameters: {
        type: 'object',
        properties: {
          presetId: { type: 'string', description: '预设ID或名称' }
        },
        required: ['presetId']
      }
    }
  },

  // ══ Wave 4：Skill 自动化系统 ══
  {
    type: 'function',
    function: {
      name: 'create_skill',
      description: '创建一个可复用的自动化工作流 Skill。Skill 由多个步骤组成，每步调用一个工具。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Skill名称' },
          description: { type: 'string', description: '功能描述' },
          icon: { type: 'string', description: '图标emoji' },
          variables: {
            type: 'array',
            items: { type: 'string' },
            description: '变量名数组，执行时需要用户提供的参数'
          },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tool: { type: 'string', description: '工具函数名' },
                params: { type: 'object', description: '参数对象，可用 {{变量名}} 做替换' },
                repeat: { type: 'string', description: '重复次数或变量名' }
              },
              required: ['tool']
            },
            description: '步骤数组'
          }
        },
        required: ['name', 'steps']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_skills',
      description: '列出所有已保存的 Skills',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_skill',
      description: '查看某个 Skill 的详细步骤和变量',
      parameters: {
        type: 'object',
        properties: {
          skillId: { type: 'string', description: 'Skill ID 或名称' }
        },
        required: ['skillId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'execute_skill',
      description: '执行一个已保存的 Skill，传入所需的变量值',
      parameters: {
        type: 'object',
        properties: {
          skillId: { type: 'string', description: 'Skill ID 或名称' },
          variables: {
            type: 'object',
            description: '变量键值对，如 { "character": "穿白裙的少女" }'
          }
        },
        required: ['skillId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_skill',
      description: '编辑一个已有的 Skill',
      parameters: {
        type: 'object',
        properties: {
          skillId: { type: 'string', description: 'Skill ID 或名称' },
          name: { type: 'string', description: '新名称' },
          description: { type: 'string', description: '新描述' },
          icon: { type: 'string', description: '新图标' },
          steps: { type: 'array', description: '新步骤数组' },
          variables: { type: 'array', description: '新变量列表' }
        },
        required: ['skillId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_skill',
      description: '删除一个 Skill',
      parameters: {
        type: 'object',
        properties: {
          skillId: { type: 'string', description: 'Skill ID 或名称' }
        },
        required: ['skillId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'export_skill',
      description: '将 Skill 导出为 JSON 字符串，可分享给其他用户',
      parameters: {
        type: 'object',
        properties: {
          skillId: { type: 'string', description: 'Skill ID 或名称' }
        },
        required: ['skillId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'import_skill',
      description: '从 JSON 字符串导入一个 Skill',
      parameters: {
        type: 'object',
        properties: {
          json: { type: 'string', description: 'Skill 的 JSON 字符串' }
        },
        required: ['json']
      }
    }
  },

  // ══ Wave 5：项目管理 + 高级画布编排 ══
  {
    type: 'function',
    function: {
      name: 'get_project_info',
      description: '获取当前打开的项目信息',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'rename_project',
      description: '重命名当前项目',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '新项目名称' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'suggest_next_steps',
      description: '根据画布当前状态智能推荐下一步操作',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'arrange_by_type',
      description: '按节点类型分区域排列画布（图片放一区、视频放一区等）',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'align_nodes',
      description: '将多个节点对齐（左对齐、右对齐、顶部、底部、水平居中、垂直居中）',
      parameters: {
        type: 'object',
        properties: {
          nodeIds: {
            type: 'array',
            items: { type: 'string' },
            description: '要对齐的节点ID数组，不填则对齐当前选中节点'
          },
          direction: {
            type: 'string',
            enum: ['left', 'right', 'top', 'bottom', 'center-x', 'center-y'],
            description: '对齐方向'
          }
        },
        required: ['direction']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'distribute_nodes',
      description: '将多个节点均匀分布（等距排列）',
      parameters: {
        type: 'object',
        properties: {
          nodeIds: {
            type: 'array',
            items: { type: 'string' },
            description: '要分布的节点ID数组，不填则使用当前选中节点'
          },
          direction: {
            type: 'string',
            enum: ['horizontal', 'vertical'],
            description: '分布方向：水平或垂直'
          }
        }
      }
    }
  },

  // ══ Wave 6：智能感知与分析 ══
  {
    type: 'function',
    function: {
      name: 'capture_canvas_for_review',
      description: '生成画布状态的结构化快照，供 AI 分析风格一致性和布局合理性',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'extract_style_dna',
      description: '从已完成的生成结果中提取风格 DNA（画风/配色/光影/构图/氛围）',
      parameters: {
        type: 'object',
        properties: {
          historyId: { type: 'string', description: '历史记录ID' },
          nodeId: { type: 'string', description: '节点ID，取最近的完成结果' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'score_generation_result',
      description: '对一个生成结果进行智能评分（画质/相关度/构图/色彩/创意）',
      parameters: {
        type: 'object',
        properties: {
          historyId: { type: 'string', description: '历史记录ID' },
          nodeId: { type: 'string', description: '节点ID，取最近的完成结果' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_user_preferences',
      description: '分析用户的创作偏好（常用模型/比例/风格关键词/成功率）',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_selected_nodes_detail',
      description: '获取当前画布上选中节点的完整详细信息',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'batch_update_selected',
      description: '批量更新当前选中的所有节点的设置（如统一风格/模型）',
      parameters: {
        type: 'object',
        properties: {
          updates: {
            type: 'object',
            description: '要更新的设置键值对，如 { "model": "flux", "ratio": "16:9" }'
          }
        },
        required: ['updates']
      }
    }
  },

  // ══ Wave 7：链式反应 + 多 Agent ══
  {
    type: 'function',
    function: {
      name: 'setup_auto_pipeline',
      description: '设置自动流水线：当生成完成后自动触发后续步骤（如出图→生视频→入库）',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '流水线名称' },
          trigger: {
            type: 'string',
            enum: ['on_any_complete', 'on_image_complete', 'on_video_complete'],
            description: '触发条件'
          },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tool: { type: 'string', description: '工具名' },
                params: { type: 'object', description: '参数' }
              },
              required: ['tool']
            },
            description: '完成后要执行的步骤'
          }
        },
        required: ['name', 'steps']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_pipelines',
      description: '列出所有已设置的自动流水线',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'toggle_pipeline',
      description: '启用或禁用一个流水线',
      parameters: {
        type: 'object',
        properties: {
          pipelineId: { type: 'string', description: '流水线ID或名称' },
          enabled: { type: 'boolean', description: 'true启用/false禁用' }
        },
        required: ['pipelineId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_pipeline',
      description: '删除一个流水线',
      parameters: {
        type: 'object',
        properties: {
          pipelineId: { type: 'string', description: '流水线ID或名称' }
        },
        required: ['pipelineId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_agent_modes',
      description: '列出所有可用的 AI 专家模式（美术总监/编剧/导演/QA/提示词大师）',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'switch_agent_mode',
      description: '切换 AI 的专家角色模式',
      parameters: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: [
              'default',
              'art_director',
              'screenwriter',
              'director',
              'qa_reviewer',
              'prompt_master'
            ],
            description: '模式名称'
          }
        },
        required: ['mode']
      }
    }
  },

  // ══ Wave 8：定时任务 + 联网搜索 ══
  {
    type: 'function',
    function: {
      name: 'create_timer_task',
      description: '创建一个定时执行的任务（如每30分钟自动执行某个 Skill）',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '任务名称' },
          intervalMinutes: { type: 'number', description: '执行间隔（分钟），1-1440' },
          skillId: { type: 'string', description: '要执行的 Skill ID 或名称' },
          variables: { type: 'object', description: 'Skill 变量' }
        },
        required: ['name', 'intervalMinutes']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_timer_tasks',
      description: '列出所有定时任务',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cancel_timer_task',
      description: '取消一个定时任务',
      parameters: {
        type: 'object',
        properties: {
          timerId: { type: 'string', description: '定时任务ID或名称' }
        },
        required: ['timerId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: '联网搜索信息（如流行趋势、参考资料等）',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          type: {
            type: 'string',
            enum: ['general', 'images', 'trends'],
            description: '搜索类型'
          }
        },
        required: ['query']
      }
    }
  },

  // ══ Sprint 1：截图 + 便签 + 标签 ══
  {
    type: 'function',
    function: {
      name: 'capture_canvas',
      description:
        '截取画布内容。模式：viewport(可视区域) 或 selection(框选截图，会弹出遮罩让用户框选)',
      parameters: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['viewport', 'selection'],
            description: '截图模式'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_sticky_note',
      description: '在画布上创建一个便签节点。便签是纯文字的轻量标注节点，支持多种颜色。',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '便签文字内容' },
          color: {
            type: 'string',
            enum: ['yellow', 'blue', 'green', 'red', 'purple'],
            description: '便签颜色，默认黄色'
          },
          x: { type: 'number', description: 'X坐标（可选）' },
          y: { type: 'number', description: 'Y坐标（可选）' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_group_params',
      description: '为节点分组设置通用参数（模型、提示词前缀等），组内所有节点会继承这些参数',
      parameters: {
        type: 'object',
        properties: {
          groupId: { type: 'string', description: '分组ID' },
          model: { type: 'string', description: '通用模型ID' },
          promptPrefix: { type: 'string', description: '通用提示词前缀' },
          ratio: { type: 'string', description: '通用画面比例' },
          resolution: { type: 'string', description: '通用分辨率' }
        },
        required: ['groupId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'collapse_group',
      description: '折叠或展开一个分组（折叠后组内节点隐藏，仅显示小卡片）',
      parameters: {
        type: 'object',
        properties: {
          groupId: { type: 'string', description: '分组ID' }
        },
        required: ['groupId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_tag',
      description: '添加一个全局标签到标签系统（人物、场景、第一幕 等）',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '标签名称' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'remove_tag',
      description: '删除一个全局标签',
      parameters: {
        type: 'object',
        properties: {
          tagId: { type: 'string', description: '标签ID' }
        },
        required: ['tagId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'tag_node',
      description: '给指定节点打标签',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: '节点ID' },
          tagId: { type: 'string', description: '标签ID' }
        },
        required: ['nodeId', 'tagId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'filter_by_tag',
      description: '按标签筛选画布节点（高亮匹配节点，其余半透明化）。传 null 清除筛选。',
      parameters: {
        type: 'object',
        properties: {
          tagId: { type: 'string', description: '标签ID，传空字符串清除筛选' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'auto_suggest_tags',
      description: '让AI根据节点提示词内容自动建议合适的标签',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: '节点ID' }
        },
        required: ['nodeId']
      }
    }
  },

  // ══ Sprint 2：项目管理 + AI 气泡 ══
  {
    type: 'function',
    function: {
      name: 'open_project_manager',
      description: '打开全屏项目管理画廊视图',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_projects',
      description: '列出所有已保存的项目',
      parameters: { type: 'object', properties: {} }
    }
  },

  // ══ Sprint 3：批量生产板 ══
  {
    type: 'function',
    function: {
      name: 'open_production_board',
      description: '打开批量生产板（表格式批量创建生成任务）',
      parameters: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['video', 'image'],
            description: '模式：video(视频) 或 image(图片)'
          }
        }
      }
    }
  }
]
